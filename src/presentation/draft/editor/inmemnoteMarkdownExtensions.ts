import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

/**
 * Inmemnote-specific decorators on top of `@codemirror/lang-markdown`.
 *
 * Two concerns live here, sharing a single ViewPlugin so we walk the visible
 * lines exactly once per update:
 *
 *   1. Hide leading markdown markers (`#`, `>`, `-`, `1.`, `[ ]`, …) on every
 *      line that does NOT contain a cursor. The marker reappears the moment
 *      the caret moves to that line — matches the hi-fi mock where the user
 *      sees the rendered look until they want to edit syntax.
 *
 *   2. Tag blockquote lines with a CSS class so they get the accent-colored
 *      left border. Doing this in a decorator rather than via the lang-markdown
 *      tokens lets us keep the styling rules entirely in our own theme file.
 *
 * Why ViewPlugin (not StateField): decorations depend on `view.viewport` and
 * the *current* selection — both view-only concerns. StateField would force us
 * to recompute on every transaction, including non-visible ones.
 */

// `^#{1,6}\s` (ATX heading) — capture the marker + trailing space.
const HEADING_RE = /^(#{1,6})\s/;

// `^>\s?` (blockquote). We don't try to handle nested quotes here — the visual
// difference is irrelevant in V1 and complicating the regex would invite bugs.
const QUOTE_RE = /^(>)\s?/;

// `^[-*+]\s` (bullet list).
const BULLET_RE = /^([-*+])\s/;

// `^\d+\.\s` (ordered list).
const OL_RE = /^(\d+\.)\s/;

// `^[-*+]\s\[[ xX]\]\s` (task list inside a bullet).
const TASK_RE = /^[-*+]\s(\[[ xX]\])\s/;

// `Decoration.replace` removes the range from the visible flow entirely (an
// empty replacement widget), unlike `Decoration.mark({ class: 'hidden' })`
// which would only paint the span transparent while still reserving space.
// The user wants the heading text to sit flush left when the caret is not on
// the line, so we ditched the mark approach.
const hiddenMarker = Decoration.replace({});
const quoteLine = Decoration.line({ class: 'cm-inmem-quote' });

// Heading-line decorations. The inline `HighlightStyle` already enlarges the
// heading TEXT, but `.cm-line` keeps its default block metrics, so multi-line
// wrapping looks cramped. Tagging the whole line lets us bump `line-height`
// and add a small top margin between blocks.
const h1Line = Decoration.line({ class: 'cm-inmem-h1' });
const h2Line = Decoration.line({ class: 'cm-inmem-h2' });
const h3Line = Decoration.line({ class: 'cm-inmem-h3' });

interface Match {
  /** Offset within the line where the marker starts. */
  from: number;
  /** Offset within the line where the marker ends. */
  to: number;
}

/**
 * Find the leading marker on a line, if any. Returns the absolute offsets
 * for the marker substring or `null` when the line is not a markdown block
 * start that we want to fade out.
 */
function findLeadingMarker(text: string): Match | null {
  // Order matters: task-list lines also match BULLET_RE, but we want to hide
  // both the bullet and the checkbox together.
  const task = TASK_RE.exec(text);
  if (task) return { from: 0, to: task[0].length };

  const heading = HEADING_RE.exec(text);
  if (heading) return { from: 0, to: heading[0].length };

  const quote = QUOTE_RE.exec(text);
  if (quote) return { from: 0, to: quote[0].length };

  const bullet = BULLET_RE.exec(text);
  if (bullet) return { from: 0, to: bullet[0].length };

  const ol = OL_RE.exec(text);
  if (ol) return { from: 0, to: ol[0].length };

  return null;
}

/**
 * Build the decoration set for the current viewport.
 *
 * Important contract: decorations MUST be produced in document order, which is
 * why we feed `RangeSetBuilder` one line at a time, top-down. CodeMirror will
 * throw if we try to add an out-of-order range.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  // Collect the line numbers that currently host a selection cursor. The
  // user can have multi-cursors, so we treat any selection range that
  // touches a line as "active".
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

      // Line-level decorations go first (per builder ordering rules).
      // Headings vs. blockquote are mutually exclusive at the line level,
      // so a single branch suffices.
      const heading = HEADING_RE.exec(text);
      if (heading) {
        const level = heading[1]?.length ?? 1;
        const deco = level === 1 ? h1Line : level === 2 ? h2Line : h3Line;
        builder.add(line.from, line.from, deco);
      } else if (QUOTE_RE.test(text)) {
        builder.add(line.from, line.from, quoteLine);
      }

      // Mark-level decoration: hide the leading marker for non-active lines.
      const marker = findLeadingMarker(text);
      if (marker && !activeLines.has(line.number)) {
        builder.add(line.from + marker.from, line.from + marker.to, hiddenMarker);
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

export const inmemnoteMarkdownExtensions = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }
      update(u: ViewUpdate) {
        // Recompute when anything user-visible changed: doc edits, selection
        // moves, or a scroll that revealed new lines.
        if (u.docChanged || u.selectionSet || u.viewportChanged) {
          this.decorations = buildDecorations(u.view);
        }
      }
    },
    { decorations: (p) => p.decorations },
  ),
];
