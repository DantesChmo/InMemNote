import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

import { inmemnoteMarkdownExtensions } from './inmemnoteMarkdownExtensions';

/**
 * Syntax highlight rules for the Markdown source we author.
 *
 * `@codemirror/lang-markdown` parses the document into Lezer tags but does
 * NOT ship a default style — we have to map the tags to CSS ourselves.
 * Inline tags (`strong`, `emphasis`, `monospace`) are applied to the matched
 * spans; heading tags apply to the entire content of the line, so the
 * `# ` marker also enlarges while the caret is on that line (it disappears
 * via `cm-inmem-hide` once focus moves away).
 */
const inmemHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: '20px', fontWeight: '700', lineHeight: '28px' },
  { tag: t.heading2, fontSize: '17px', fontWeight: '700', lineHeight: '26px' },
  { tag: t.heading3, fontSize: '15px', fontWeight: '700', lineHeight: '24px' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.monospace, fontFamily: 'var(--f-mono)', fontSize: '13px' },
  // NOTE: we used to dim `t.processingInstruction` here, but that set an
  // explicit `color: var(--text-3)` on every syntax marker (`#`, `**`, `*`,
  // `>`, …) which overrode our `cm-inmem-hide` rule — so markers stayed
  // visible on inactive lines. The dimming is unnecessary: on the active
  // line the marker shows up at normal `var(--text)`, on inactive lines it
  // disappears entirely through the mark decoration.
]);

/**
 * CodeMirror 6 wrapper for the Draft body.
 *
 * Why this layer instead of using CM directly: React owns the lifecycle, but
 * CM owns the DOM. We give CM a single mount node, then sync only when the
 * external `value` differs from what's already in the editor — otherwise every
 * keystroke would round-trip through Redux and back, racing with the user.
 *
 * The `onChange` callback fires on every doc update; the autosave debounce
 * lives in the parent component, not here.
 */
export interface CodeMirrorEditorProps {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export function CodeMirrorEditor(props: CodeMirrorEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Stable ref to the latest onChange — avoids tearing down the view on every render.
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: props.value,
      extensions: [
        history(),
        keymap.of([
          // Tab / Shift+Tab are registered BEFORE the default keymap so they
          // win over the browser's focus-moving behavior. `indentMore` works
          // for any indented block including markdown lists, which is what we
          // want for nesting.
          { key: 'Tab', run: indentMore, shift: indentLess },
          ...defaultKeymap,
          ...historyKeymap,
          {
            key: 'Mod-Enter',
            run: () => {
              props.onSubmit?.();
              return true;
            },
          },
          {
            key: 'Escape',
            run: () => {
              props.onCancel?.();
              return true;
            },
          },
        ]),
        markdown(),
        syntaxHighlighting(inmemHighlightStyle),
        inmemnoteMarkdownExtensions,
        placeholderExt(props.placeholder ?? ''),
        EditorView.lineWrapping,
        EditorView.theme(
          {
            '&': {
              backgroundColor: 'transparent',
              color: 'var(--text)',
              fontFamily: 'var(--f-ui)',
              fontSize: '15px',
              lineHeight: '24px',
              // Fill the parent's height. By default CM 6 sizes the editor
              // to its content, so a roomy panel ends up with a small
              // input area floating at the top. Forcing `height: 100%` on
              // the editor + `flex: 1` / `min-height: 0` upstream lets the
              // user click anywhere in the body to position the caret.
              height: '100%',
            },
            '.cm-content': {
              padding: '0',
              caretColor: 'var(--accent)',
              // Push the content area to fill at least the visible height,
              // so blank lines at the bottom of the panel still respond to
              // clicks (they place the cursor at end-of-doc).
              minHeight: '100%',
            },
            '.cm-cursor': { borderLeftColor: 'var(--accent)' },
            '.cm-line': { padding: '0' },
            '.cm-scroller': { fontFamily: 'var(--f-ui)', overflow: 'auto' },
            '&.cm-focused': { outline: 'none' },
            // Blockquote stripe: 2px left border in the accent color + matching
            // muted text shade. Padding offsets the border so the text itself
            // does not move when the line becomes/ceases to be a quote.
            '.cm-inmem-quote': {
              boxShadow: 'inset 2px 0 0 var(--accent)',
              paddingLeft: '14px',
              color: 'var(--text-2)',
              fontStyle: 'italic',
            },
            // Pretty bullet replacement for `-` / `*` / `+` lines. The widget
            // is rendered inline by CodeMirror; we just style its container.
            '.cm-inmem-bullet': {
              display: 'inline-block',
              width: '18px',
              color: 'var(--accent)',
              fontWeight: '700',
            },
            // Ordered-list marker keeps the original number but renders it in
            // the muted text shade so it doesn't compete with the body.
            '.cm-inmem-ol': {
              display: 'inline-block',
              minWidth: '20px',
              marginRight: '4px',
              color: 'var(--text-3)',
              fontVariantNumeric: 'tabular-nums',
            },
            // Heading lines. HighlightStyle alone only styles the `#` marker
            // token; the heading TEXT after it stays at body size, so we have
            // to scale the whole `.cm-line` instead. A small `margin-top`
            // provides breathing room between blocks without poking at general
            // line spacing.
            '.cm-inmem-h1': {
              fontSize: '20px',
              lineHeight: '28px',
              fontWeight: '700',
              marginTop: '6px',
            },
            '.cm-inmem-h2': {
              fontSize: '17px',
              lineHeight: '26px',
              fontWeight: '700',
              marginTop: '4px',
            },
            '.cm-inmem-h3': {
              fontSize: '15px',
              lineHeight: '24px',
              fontWeight: '700',
              marginTop: '2px',
            },
          },
          { dark: document.documentElement.dataset.theme === 'dark' },
        ),
        EditorView.updateListener.of((v) => {
          if (v.docChanged) onChangeRef.current(v.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    if (props.autoFocus) view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // We intentionally create the view exactly once: parent props that change
    // afterwards (value, placeholder) are synced via the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value -> editor sync (no echo back to onChange).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === props.value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: props.value },
    });
  }, [props.value]);

  // `h-full` so the CodeMirror EditorView, which sets `height: 100%` on
  // itself, has a definite parent to measure against.
  return <div ref={hostRef} className="draft-no-drag w-full h-full" />;
}
