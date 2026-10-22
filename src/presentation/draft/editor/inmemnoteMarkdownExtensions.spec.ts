import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { inmemnoteMarkdownExtensions } from './inmemnoteMarkdownExtensions';

/**
 * Behavioural tests for the Inmemnote markdown decorators, run against a
 * real CodeMirror 6 `EditorView` mounted in jsdom.
 *
 * We read back what the user would see: the rendered text of each
 * `.cm-line` (hidden markers vanish from the DOM, bullet / number widgets
 * appear in their place) and the line-level block classes the theme styles
 * (`cm-inmem-h1..3`, `cm-inmem-quote`). The cursor is placed through the
 * editor selection, which is exactly what a click or arrow key would do.
 *
 * jsdom has no layout, so CodeMirror cannot measure anything; for the short
 * documents used here the whole doc still lands in the initial viewport,
 * which is all the plugin needs (it only walks `view.visibleRanges`).
 */

let view: EditorView | null = null;

function mount(doc: string, cursor: number | EditorSelection = doc.length): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: typeof cursor === 'number' ? EditorSelection.cursor(cursor) : cursor,
      extensions: [EditorState.allowMultipleSelections.of(true), inmemnoteMarkdownExtensions],
    }),
  });
  return view;
}

function lines(v: EditorView): HTMLElement[] {
  return Array.from(v.contentDOM.querySelectorAll<HTMLElement>('.cm-line'));
}

/** Visible text per line, as rendered (widgets included, hidden markers gone). */
function rendered(v: EditorView): string[] {
  return lines(v).map((l) => l.textContent ?? '');
}

function line(v: EditorView, n: number): HTMLElement {
  const el = lines(v)[n - 1];
  if (!el) throw new Error(`no rendered line ${n}`);
  return el;
}

/** Offset of the start of 1-based line `n`. */
function lineStart(v: EditorView, n: number): number {
  return v.state.doc.line(n).from;
}

function moveCursorTo(v: EditorView, pos: number): void {
  v.dispatch({ selection: EditorSelection.cursor(pos) });
}

// Put the caret on a trailing empty line so every content line is inactive.
const AWAY = '\n';

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = '';
});

describe('inmemnoteMarkdownExtensions', () => {
  describe('headings', () => {
    it('hides the "#" marker on an inactive heading line', () => {
      const v = mount(`# Title${AWAY}`);

      expect(rendered(v)[0]).toBe('Title');
    });

    it.each([
      ['# One', 'cm-inmem-h1'],
      ['## Two', 'cm-inmem-h2'],
      ['### Three', 'cm-inmem-h3'],
    ])('tags "%s" with %s', (text, cls) => {
      const v = mount(`${text}${AWAY}`);

      expect(line(v, 1)).toHaveClass(cls);
    });

    it('styles h4–h6 like h3 (the design has three heading sizes)', () => {
      const v = mount(`#### Four\n###### Six${AWAY}`);

      expect(line(v, 1)).toHaveClass('cm-inmem-h3');
      expect(line(v, 2)).toHaveClass('cm-inmem-h3');
      expect(rendered(v).slice(0, 2)).toEqual(['Four', 'Six']);
    });

    it('keeps the heading class on the active line but shows the raw marker for editing', () => {
      const v = mount('## Editing', 3);

      expect(line(v, 1)).toHaveClass('cm-inmem-h2');
      expect(rendered(v)[0]).toBe('## Editing');
    });

    it.each(['#NoSpace', '####### seven hashes', '  # indented'])(
      'does not treat "%s" as a heading',
      (text) => {
        const v = mount(`${text}${AWAY}`);

        expect(line(v, 1).className).not.toMatch(/cm-inmem-h/);
        expect(rendered(v)[0]).toBe(text);
      },
    );
  });

  describe('blockquotes', () => {
    it('tags the line as a quote and hides the ">" marker when inactive', () => {
      const v = mount(`> wise words${AWAY}`);

      expect(line(v, 1)).toHaveClass('cm-inmem-quote');
      expect(rendered(v)[0]).toBe('wise words');
    });

    it('hides a ">" that is not followed by a space', () => {
      const v = mount(`>tight${AWAY}`);

      expect(rendered(v)[0]).toBe('tight');
    });

    it('keeps leading indentation in front of a nested quote', () => {
      const v = mount(`  > nested${AWAY}`);

      expect(line(v, 1)).toHaveClass('cm-inmem-quote');
      expect(rendered(v)[0]).toBe('  nested');
    });

    it('shows the raw marker while the caret is on the quote', () => {
      const v = mount('> editing', 4);

      expect(line(v, 1)).toHaveClass('cm-inmem-quote');
      expect(rendered(v)[0]).toBe('> editing');
    });

    it('does not tag ordinary lines as quotes or headings', () => {
      const v = mount(`just text${AWAY}`);

      expect(line(v, 1).className).not.toMatch(/cm-inmem-/);
      expect(rendered(v)[0]).toBe('just text');
    });
  });

  describe('bullet lists', () => {
    it.each(['-', '*', '+'])('renders a "%s" marker as a typographic bullet', (marker) => {
      const v = mount(`${marker} item${AWAY}`);

      expect(rendered(v)[0]).toBe('•item');
      expect(line(v, 1).querySelector('.cm-inmem-bullet')).toHaveTextContent('•');
    });

    it('preserves the nesting indent in front of the bullet', () => {
      const v = mount(`- top\n  - nested\n    - deeper${AWAY}`);

      expect(rendered(v).slice(0, 3)).toEqual(['•top', '  •nested', '    •deeper']);
    });

    it('shows the raw "-" marker on the active line', () => {
      const v = mount('- editing', 5);

      expect(rendered(v)[0]).toBe('- editing');
      expect(line(v, 1).querySelector('.cm-inmem-bullet')).toBeNull();
    });

    it('leaves "-" without a following space alone (not a list item)', () => {
      const v = mount(`-not a list${AWAY}`);

      expect(rendered(v)[0]).toBe('-not a list');
    });
  });

  describe('ordered lists', () => {
    it('replaces the number marker with a widget that keeps the original number', () => {
      const v = mount(`1. first\n2. second\n12. twelfth${AWAY}`);

      expect(rendered(v).slice(0, 3)).toEqual(['1.first', '2.second', '12.twelfth']);
      const numbers = Array.from(v.contentDOM.querySelectorAll('.cm-inmem-ol')).map(
        (el) => el.textContent,
      );
      expect(numbers).toEqual(['1.', '2.', '12.']);
    });

    it('preserves the nesting indent in front of the number', () => {
      const v = mount(`1. top\n   1. nested${AWAY}`);

      expect(rendered(v).slice(0, 2)).toEqual(['1.top', '   1.nested']);
    });

    it('shows the raw number marker on the active line', () => {
      const v = mount('3. editing', 4);

      expect(rendered(v)[0]).toBe('3. editing');
    });

    it('leaves a number without a dot alone', () => {
      const v = mount(`2026 was a year${AWAY}`);

      expect(rendered(v)[0]).toBe('2026 was a year');
    });
  });

  describe('task lists', () => {
    it.each(['- [ ] todo', '- [x] done', '* [X] shouted'])(
      'drops both the bullet and the checkbox of "%s"',
      (text) => {
        const v = mount(`${text}${AWAY}`);

        expect(rendered(v)[0]).toBe(text.slice(6));
        expect(line(v, 1).querySelector('.cm-inmem-bullet')).toBeNull();
      },
    );

    it('keeps the indent of a nested task', () => {
      const v = mount(`  - [ ] nested todo${AWAY}`);

      expect(rendered(v)[0]).toBe('  nested todo');
    });

    it('shows the raw task syntax on the active line', () => {
      const v = mount('- [ ] editing', 8);

      expect(rendered(v)[0]).toBe('- [ ] editing');
    });
  });

  describe('active-line tracking', () => {
    it('reveals the marker when the caret moves onto a line and hides it when it leaves', () => {
      const v = mount(`# Title\n- item${AWAY}`);
      expect(rendered(v).slice(0, 2)).toEqual(['Title', '•item']);

      moveCursorTo(v, lineStart(v, 1));
      expect(rendered(v).slice(0, 2)).toEqual(['# Title', '•item']);

      moveCursorTo(v, lineStart(v, 2));
      expect(rendered(v).slice(0, 2)).toEqual(['Title', '- item']);
    });

    it('treats every line holding a cursor as active (multi-cursor)', () => {
      const doc = `# A\n# B\n# C${AWAY}`;
      const v = mount(
        doc,
        EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(9)]),
      );

      expect(rendered(v).slice(0, 3)).toEqual(['# A', 'B', '# C']);
    });

    it('treats both the anchor line and the head line of a selection as active', () => {
      const doc = `# A\n# B\n# C${AWAY}`;
      const v = mount(doc, EditorSelection.single(1, 9));

      expect(rendered(v)[0]).toBe('# A');
      expect(rendered(v)[2]).toBe('# C');
    });

    it('keeps the same bullet / number DOM nodes while the caret moves between other lines', () => {
      const v = mount(`- milk\n1. bread\nplain\nmore${AWAY}`);
      const bullet = v.contentDOM.querySelector('.cm-inmem-bullet');
      const number = v.contentDOM.querySelector('.cm-inmem-ol');

      moveCursorTo(v, lineStart(v, 3));
      moveCursorTo(v, lineStart(v, 4));

      expect(v.contentDOM.querySelector('.cm-inmem-bullet')).toBe(bullet);
      expect(v.contentDOM.querySelector('.cm-inmem-ol')).toBe(number);
    });

    it('re-renders the number widget when the list number itself changes', () => {
      const v = mount(`1. bread${AWAY}`);

      v.dispatch({ changes: { from: 0, to: 1, insert: '7' } });

      expect(rendered(v)[0]).toBe('7.bread');
    });

    it('re-decorates after a document change', () => {
      const v = mount(`plain${AWAY}`);

      // Type "# " in front of line 1 while the caret stays on the last line.
      v.dispatch({ changes: { from: 0, insert: '# ' } });

      expect(line(v, 1)).toHaveClass('cm-inmem-h1');
      expect(rendered(v)[0]).toBe('plain');
    });

    it('drops the block class once the marker is deleted', () => {
      const v = mount(`> quote${AWAY}`);

      v.dispatch({ changes: { from: 0, to: 2 } });

      expect(line(v, 1).className).not.toMatch(/cm-inmem-/);
      expect(rendered(v)[0]).toBe('quote');
    });
  });

  it('decorates a mixed document line by line', () => {
    const doc = [
      '# Shopping',
      '> for the weekend',
      '- milk',
      '  - oat',
      '1. bread',
      '- [ ] eggs',
    ].join('\n');
    const v = mount(`${doc}${AWAY}`);

    expect(rendered(v)).toEqual([
      'Shopping',
      'for the weekend',
      '•milk',
      '  •oat',
      '1.bread',
      'eggs',
      '',
    ]);
  });
});
