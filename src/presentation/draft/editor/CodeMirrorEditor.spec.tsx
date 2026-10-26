import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { CodeMirrorEditor, type CodeMirrorEditorProps } from './CodeMirrorEditor';

/**
 * `CodeMirrorEditor` is the React ↔ CodeMirror seam, so unlike its parents'
 * tests (which stub it out) this one mounts the real CM6 editor in jsdom.
 *
 * Keyboard shortcuts are driven with real `keydown` events on the editor's
 * content element — that is what CodeMirror's keymap listens to. jsdom
 * reports an empty `navigator.platform`, so CodeMirror resolves `Mod` to
 * Ctrl here (it is ⌘ on macOS); the tests press Ctrl accordingly.
 *
 * Typing is simulated by dispatching a transaction on the mounted view:
 * jsdom has no `beforeinput`/selection plumbing for contenteditable, and a
 * dispatched insert is exactly what CodeMirror's own input handler ends up
 * doing for a keystroke.
 */

function setup(overrides: Partial<CodeMirrorEditorProps> = {}) {
  const props: CodeMirrorEditorProps = {
    value: '',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const utils = render(<CodeMirrorEditor {...props} />);
  const editorDom = utils.container.querySelector<HTMLElement>('.cm-editor');
  if (!editorDom) throw new Error('CodeMirror did not mount');
  const view = EditorView.findFromDOM(editorDom);
  if (!view) throw new Error('no EditorView behind .cm-editor');
  return { ...utils, props, view };
}

function press(view: EditorView, key: string, mods: { ctrl?: boolean; shift?: boolean } = {}) {
  const keyCode = { Enter: 13, Escape: 27, Tab: 9 }[key];
  fireEvent.keyDown(view.contentDOM, {
    key,
    keyCode,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
  });
}

function typeAt(view: EditorView, pos: number, text: string) {
  act(() => {
    view.dispatch({
      changes: { from: pos, insert: text },
      selection: EditorSelection.cursor(pos + text.length),
      userEvent: 'input.type',
    });
  });
}

describe('CodeMirrorEditor', () => {
  describe('mounting', () => {
    it('shows the initial value', () => {
      const { view } = setup({ value: 'hello\nworld' });

      expect(view.state.doc.toString()).toBe('hello\nworld');
      expect(view.contentDOM).toHaveTextContent('hello');
    });

    it('shows the placeholder while the document is empty', () => {
      setup({ value: '', placeholder: 'Start typing…' });

      expect(screen.getByText('Start typing…')).toBeInTheDocument();
    });

    it('hides the placeholder once there is content', () => {
      setup({ value: 'something', placeholder: 'Start typing…' });

      expect(screen.queryByText('Start typing…')).toBeNull();
    });

    it('focuses the editor when autoFocus is set', () => {
      const { view } = setup({ autoFocus: true });

      expect(view.hasFocus).toBe(true);
    });

    it('does not steal focus without autoFocus', () => {
      const { view } = setup();

      expect(view.hasFocus).toBe(false);
    });

    it('tears the editor down on unmount', () => {
      const { container, unmount } = setup({ value: 'bye' });

      unmount();

      expect(container.querySelector('.cm-editor')).toBeNull();
    });
  });

  describe('onChange', () => {
    it('reports the full document after every edit', () => {
      const { view, props } = setup({ value: 'ab' });

      typeAt(view, 2, 'c');

      expect(props.onChange).toHaveBeenLastCalledWith('abc');
    });

    it('does not fire for selection-only changes', () => {
      const { view, props } = setup({ value: 'abc' });

      act(() => view.dispatch({ selection: EditorSelection.cursor(1) }));

      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('always calls the latest onChange prop, without remounting the editor', () => {
      const first = vi.fn();
      const second = vi.fn();
      const { view, rerender } = setup({ value: '', onChange: first });

      rerender(<CodeMirrorEditor value="" onChange={second} />);
      typeAt(view, 0, 'x');

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenLastCalledWith('x');
      expect(EditorView.findFromDOM(view.dom)).toBe(view);
    });
  });

  describe('external value sync', () => {
    it('replaces the document when the value prop changes', () => {
      const onChange = vi.fn();
      const { view, rerender } = setup({ value: 'old', onChange });

      rerender(<CodeMirrorEditor value="new text" onChange={onChange} />);

      expect(view.state.doc.toString()).toBe('new text');
    });

    // Regression for BUG C: the sync dispatched an ordinary transaction, so the
    // update listener reported the parent's own value back as a user edit —
    // in DraftPanel every `setDraft` became an extra `editContent` plus a
    // redundant debounced save.
    it('BUG C: an external value change is not echoed back through onChange', () => {
      const onChange = vi.fn();
      const { rerender } = setup({ value: 'old', onChange });

      rerender(<CodeMirrorEditor value="new text" onChange={onChange} />);

      expect(onChange).not.toHaveBeenCalled();
    });

    it('leaves the editor alone when the value prop already matches the document', () => {
      const onChange = vi.fn();
      const { view, rerender } = setup({ value: 'ab', onChange });
      typeAt(view, 2, 'c');
      onChange.mockClear();

      // Parent round-trips the typed text back down as the new value.
      rerender(<CodeMirrorEditor value="abc" onChange={onChange} />);

      expect(view.state.doc.toString()).toBe('abc');
      expect(view.state.selection.main.head).toBe(3);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('keyboard', () => {
    // Regression for BUG A: `defaultKeymap` binds `Mod-Enter` to
    // `insertBlankLine` and used to come first, so ⌘↵ inserted a blank line and
    // `onSubmit` never fired (LibraryEditor has no document-level fallback).
    it('BUG A: Mod-Enter submits instead of inserting a blank line', () => {
      const { view, props } = setup({ value: 'note' });

      press(view, 'Enter', { ctrl: true });

      expect(props.onSubmit).toHaveBeenCalled();
      expect(view.state.doc.toString()).toBe('note');
    });

    it('plain Enter inserts a newline instead of submitting', () => {
      const { view, props } = setup({ value: 'note' });
      act(() => view.dispatch({ selection: EditorSelection.cursor(4) }));

      press(view, 'Enter');

      expect(props.onSubmit).not.toHaveBeenCalled();
      expect(view.state.doc.toString()).toBe('note\n');
    });

    it('Escape cancels', () => {
      const { view, props } = setup({ value: 'note' });

      press(view, 'Escape');

      expect(props.onCancel).toHaveBeenCalled();
    });

    // DraftPanel also listens for ⌘↵ / Esc on `document` (a fallback for when
    // the editor is not focused). If a key the editor already handled kept
    // bubbling, both handlers would fire: a double promote / double close.
    it('a handled Mod-Enter / Escape does not reach document-level listeners', () => {
      const onDocKey = vi.fn();
      document.addEventListener('keydown', onDocKey);
      try {
        const { view, props } = setup({ value: 'note' });

        press(view, 'Enter', { ctrl: true });
        press(view, 'Escape');

        expect(props.onSubmit).toHaveBeenCalledTimes(1);
        expect(props.onCancel).toHaveBeenCalledTimes(1);
        expect(onDocKey).not.toHaveBeenCalled();
      } finally {
        document.removeEventListener('keydown', onDocKey);
      }
    });

    it('without onSubmit, Mod-Enter falls through to the default keymap', () => {
      const onChange = vi.fn();
      render(<CodeMirrorEditor value="note" onChange={onChange} />);
      const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!;
      act(() => view.dispatch({ selection: EditorSelection.cursor(4) }));

      press(view, 'Enter', { ctrl: true });

      expect(view.state.doc.toString()).toBe('note\n');
    });

    it('Mod-Enter and Escape are safe without onSubmit / onCancel', () => {
      const onChange = vi.fn();
      render(<CodeMirrorEditor value="note" onChange={onChange} />);
      const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!;

      expect(() => {
        press(view, 'Enter', { ctrl: true });
        press(view, 'Escape');
      }).not.toThrow();
    });

    it('Tab nests a list item one level deeper', () => {
      const { view, props } = setup({ value: '- parent\n- child' });
      act(() => view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) }));

      press(view, 'Tab');

      expect(view.state.doc.toString()).toBe('- parent\n  - child');
      expect(props.onChange).toHaveBeenLastCalledWith('- parent\n  - child');
    });

    it('Shift-Tab un-nests a list item', () => {
      const { view } = setup({ value: '- parent\n  - child' });
      act(() => view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) }));

      press(view, 'Tab', { shift: true });

      expect(view.state.doc.toString()).toBe('- parent\n- child');
    });

    it('Tab is handled by the editor rather than moving browser focus', () => {
      const { view } = setup({ value: '- item', autoFocus: true });

      const notCancelled = fireEvent.keyDown(view.contentDOM, { key: 'Tab', keyCode: 9 });

      expect(notCancelled).toBe(false);
    });

    it('Mod-z undoes the last edit (history is wired)', () => {
      const { view } = setup({ value: 'a' });
      typeAt(view, 1, 'b');

      fireEvent.keyDown(view.contentDOM, { key: 'z', keyCode: 90, ctrlKey: true });

      expect(view.state.doc.toString()).toBe('a');
    });

    // Regression for BUG B: the keymap closed over the first render's props,
    // so ⌘↵ / Esc called a stale `onSubmit` / `onCancel` after the parent
    // rebuilt them (both DraftPanel and LibraryEditor do on every note change).
    it('BUG B: Mod-Enter calls the latest onSubmit prop, not the first-render one', () => {
      const onChange = vi.fn();
      const first = vi.fn();
      const latest = vi.fn();
      const { view, rerender } = setup({ value: 'v1', onChange, onSubmit: first });

      rerender(<CodeMirrorEditor value="v2" onChange={onChange} onSubmit={latest} />);
      press(view, 'Enter', { ctrl: true });

      expect(latest).toHaveBeenCalled();
      expect(first).not.toHaveBeenCalled();
    });

    it('BUG B: Escape calls the latest onCancel prop, not the first-render one', () => {
      const onChange = vi.fn();
      const first = vi.fn();
      const latest = vi.fn();
      const { view, rerender } = setup({ value: 'v1', onChange, onCancel: first });

      rerender(<CodeMirrorEditor value="v2" onChange={onChange} onCancel={latest} />);
      press(view, 'Escape');

      expect(latest).toHaveBeenCalled();
      expect(first).not.toHaveBeenCalled();
    });
  });
});
