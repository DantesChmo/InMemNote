import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

/**
 * Inmemnote-specific decorators on top of `@codemirror/lang-markdown`.
 *
 * Three concerns live here, sharing a single ViewPlugin so we walk the
 * visible lines exactly once per update:
 *
 *   1. Hide leading markdown markers (`#`, `>`, `-`, `1.`, `[ ]`, …) on every
 *      line that does NOT contain a cursor. The marker reappears the moment
 *      the caret moves to that line — matches the hi-fi mock where the user
 *      sees the rendered look until they want to edit syntax.
 *
 *   2. Replace bullet/numbered list markers with prettier widgets (`•`, `1.`)
 *      that align nicely without the user having to read raw `-`/`*` syntax.
 *
 *   3. Tag heading and blockquote lines with CSS classes so they get their
 *      block-level styling (size, weight, accent stripe) entirely from our
 *      theme rather than the highlight system.
 *
 * Why ViewPlugin (not StateField): decorations depend on `view.viewport` and
 * the *current* selection — both view-only concerns. StateField would force us
 * to recompute on every transaction, including non-visible ones.
 */

// All "leading marker" regexes allow optional leading whitespace because
// CodeMirror auto-indents nested list items, so a real document line can be
// e.g. `  - nested`. Without the `\s*` prefix, the marker would stay visible
// and break the look on every nested level.
const HEADING_RE = /^(#{1,6})\s/; // headings can't be indented in CommonMark, no leading ws
const QUOTE_RE = /^(\s*)>\s?/;
const BULLET_RE = /^(\s*)([-*+])\s/;
const OL_RE = /^(\s*)(\d+\.)\s/;
const TASK_RE = /^(\s*)[-*+]\s(\[[ xX]\])\s/;

const hiddenMarker = Decoration.replace({});
const quoteLine = Decoration.line({ class: 'cm-inmem-quote' });

const h1Line = Decoration.line({ class: 'cm-inmem-h1' });
const h2Line = Decoration.line({ class: 'cm-inmem-h2' });
const h3Line = Decoration.line({ class: 'cm-inmem-h3' });

// Pretty bullet widget. `eq` returns `true` because every bullet renders the
// same DOM — that lets CodeMirror reuse the existing node across updates and
// avoid pointless DOM swaps.
class BulletWidget extends WidgetType {
  public override eq(): boolean {
    return true;
  }
  public override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-inmem-bullet';
    el.textContent = '•';
    return el;
  }
}

// Numbered list marker preserves the original number. Two widgets are equal
// when they render the same number; that keeps DOM stable as the user types.
class OrderedWidget extends WidgetType {
  public constructor(public readonly num: string) {
    super();
  }
  public override eq(other: OrderedWidget): boolean {
    return other.num === this.num;
  }
  public override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-inmem-ol';
    el.textContent = `${this.num}.`;
    return el;
  }
}

interface MarkerHit {
  /** Absolute offset of the first char to replace (relative to line start). */
  from: number;
  /** Absolute offset just past the last char to replace. */
  to: number;
  /** What to drop into the slot. `null` = remove entirely. */
  widget: WidgetType | null;
}

/**
 * Identify the leading marker on a line, what it covers, and what (if
 * anything) should visually replace it.
 *
 * Order matters: task-list lines also match the bullet regex; we want to
 * hide BOTH the bullet AND the checkbox, so the task branch wins.
 */
function findLeadingMarker(text: string): MarkerHit | null {
  let m: RegExpExecArray | null;

  m = TASK_RE.exec(text);
  if (m) {
    // Task lists are rare in V1; we just drop the whole `- [x] ` prefix and
    // let the body sit flush.
    return { from: m[1]!.length, to: m[0].length, widget: null };
  }

  m = HEADING_RE.exec(text);
  if (m) {
    // Heading lines have their own block styling (cm-inmem-h*); we wipe the
    // marker outright, body text takes over from there.
    return { from: 0, to: m[0].length, widget: null };
  }

  m = QUOTE_RE.exec(text);
  if (m) {
    return { from: m[1]!.length, to: m[0].length, widget: null };
  }

  m = BULLET_RE.exec(text);
  if (m) {
    // Replace `-` / `*` / `+` with a typographic bullet that always uses our
    // accent shade. Leading whitespace is preserved so the nesting indent
    // visually survives.
    const start = m[1]!.length;
    return { from: start, to: start + 2, widget: new BulletWidget() };
  }

  m = OL_RE.exec(text);
  if (m) {
    const start = m[1]!.length;
    const numWithDot = m[2]!; // e.g. "1."
    return { from: start, to: start + numWithDot.length + 1, widget: new OrderedWidget(numWithDot.slice(0, -1)) };
  }

  return null;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  const activeLines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    activeLines.add(view.state.doc.lineAt(range.head).number);
    activeLines.add(view.state.doc.lineAt(range.anchor).number);
  }

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;

      // Line-level decorations come first per the RangeSetBuilder ordering
      // rule. Headings and blockquotes are mutually exclusive at the line
      // level, so a single branch is enough.
      const heading = HEADING_RE.exec(text);
      if (heading) {
        const level = heading[1]?.length ?? 1;
        const deco = level === 1 ? h1Line : level === 2 ? h2Line : h3Line;
        builder.add(line.from, line.from, deco);
      } else if (QUOTE_RE.test(text)) {
        builder.add(line.from, line.from, quoteLine);
      }

      // Mark-level: replace the leading marker for non-active lines.
      const marker = findLeadingMarker(text);
      if (marker && !activeLines.has(line.number)) {
        const deco = marker.widget
          ? Decoration.replace({ widget: marker.widget })
          : hiddenMarker;
        builder.add(line.from + marker.from, line.from + marker.to, deco);
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

export const inmemnoteMarkdownExtensions = [
  ViewPlugin.fromClass(
    class {
      public decorations: DecorationSet;
      public constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }
      public update(u: ViewUpdate): void {
        if (u.docChanged || u.selectionSet || u.viewportChanged) {
          this.decorations = buildDecorations(u.view);
        }
      }
    },
    { decorations: (p) => p.decorations },
  ),
];
