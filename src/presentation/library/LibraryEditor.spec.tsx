import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteDTO } from '@infrastructure/electron/ipc-channels';

const dispatch = vi.fn();
let state: { notes: NoteDTO[]; selectedId: string | null } = {
  notes: [],
  selectedId: null,
};

vi.mock('@presentation/app/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (sel: (s: { library: typeof state }) => unknown) => sel({ library: state }),
}));

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({ locale: 'en' as const, t: (k: string) => k }),
}));

vi.mock('@presentation/draft/editor/CodeMirrorEditor', () => ({
  CodeMirrorEditor: (props: {
    value: string;
    placeholder?: string;
    onChange: (next: string) => void;
    onSubmit?: () => void;
  }) => (
    <div
      data-testid="stub-editor"
      data-value={props.value}
      onClick={() => props.onChange('next-content')}
      onDoubleClick={() => props.onSubmit?.()}
    />
  ),
}));

vi.mock('./slice', () => ({
  saveNote: (payload: { id: string; content: string }) => ({
    type: 'library/saveNote',
    payload,
  }),
  toggleNotePin: (id: string) => ({ type: 'library/toggleNotePin', payload: id }),
  deleteNote: (id: string) => ({ type: 'library/deleteNote', payload: id }),
  libraryActions: {
    patchSelectedContent: (next: string) => ({
      type: 'library/patchSelectedContent',
      payload: next,
    }),
  },
}));

import { LibraryEditor } from './LibraryEditor';

const note = (over: Partial<NoteDTO>): NoteDTO => ({
  id: '1',
  title: 'T',
  content: 'T\nhello world',
  pinned: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

describe('LibraryEditor (shallow)', () => {
  beforeEach(() => {
    dispatch.mockClear();
    state = { notes: [], selectedId: null };
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders the empty state when nothing is selected', () => {
    render(<LibraryEditor />);
    expect(screen.getByText('editor.empty.title')).toBeInTheDocument();
    expect(screen.getByText('editor.empty.hint')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-editor')).toBeNull();
  });

  it('renders the editor stub and meta row when a note is selected', () => {
    state = { notes: [note({ id: 'n1' })], selectedId: 'n1' };
    render(<LibraryEditor />);

    expect(screen.getByTestId('stub-editor')).toHaveAttribute('data-value', 'T\nhello world');
    expect(screen.getByText('editor.notPinned')).toBeInTheDocument();
    expect(screen.getByText('editor.modified')).toBeInTheDocument();
    expect(screen.getByText('editor.markdownHint')).toBeInTheDocument();
  });

  it('shows "editor.pinned" when the note is pinned', () => {
    state = { notes: [note({ id: 'n1', pinned: true })], selectedId: 'n1' };
    render(<LibraryEditor />);
    expect(screen.getByText('editor.pinned')).toBeInTheDocument();
  });

  it('renders the word count based on the note body', () => {
    state = {
      notes: [note({ id: 'n1', content: 'T\nhello world from inmemnote' })],
      selectedId: 'n1',
    };
    render(<LibraryEditor />);
    // 5 words total — passed through to the stubbed `t` as the {n} parameter
    // would not be rendered, so we just assert the key shows up.
    expect(screen.getByText('editor.wordCount')).toBeInTheDocument();
  });

  it('dispatches patchSelectedContent on every change and debounces saveNote', () => {
    vi.useFakeTimers();
    try {
      state = { notes: [note({ id: 'n1' })], selectedId: 'n1' };
      render(<LibraryEditor />);

      fireEvent.click(screen.getByTestId('stub-editor'));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'library/patchSelectedContent',
        payload: 'next-content',
      });

      // Save shouldn't fire yet.
      const sawSave = dispatch.mock.calls.find(
        ([a]) => (a as { type: string }).type === 'library/saveNote',
      );
      expect(sawSave).toBeUndefined();

      // Advance the debounce.
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: 'library/saveNote',
        payload: { id: 'n1', content: 'next-content' },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('onSubmit dispatches an immediate saveNote', () => {
    state = { notes: [note({ id: 'n1' })], selectedId: 'n1' };
    render(<LibraryEditor />);
    fireEvent.doubleClick(screen.getByTestId('stub-editor'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'library/saveNote',
      payload: { id: 'n1', content: 'T\nhello world' },
    });
  });

  it('clicking the pin button dispatches toggleNotePin with the note id', () => {
    state = { notes: [note({ id: 'n1' })], selectedId: 'n1' };
    render(<LibraryEditor />);
    fireEvent.click(screen.getByTestId('lib-pin-btn'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/toggleNotePin', payload: 'n1' });
  });

  it('clicking the delete button dispatches deleteNote with the note id', () => {
    state = { notes: [note({ id: 'n1' })], selectedId: 'n1' };
    render(<LibraryEditor />);
    fireEvent.click(screen.getByTestId('lib-delete-btn'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/deleteNote', payload: 'n1' });
  });
});
