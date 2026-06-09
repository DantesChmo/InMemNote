import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteDTO } from '@infrastructure/electron/ipc-channels';

const dispatch = vi.fn();
let state: {
  notes: NoteDTO[];
  query: string;
  selectedId: string | null;
  filter: 'all' | 'pinned';
} = {
  notes: [],
  query: '',
  selectedId: null,
  filter: 'all',
};

vi.mock('@presentation/app/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (sel: (s: { library: typeof state }) => unknown) => sel({ library: state }),
}));

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({ locale: 'en' as const, t: (k: string) => k }),
}));

vi.mock('./highlight', () => ({
  highlightHTML: (text: string) => text,
}));

vi.mock('./preview', () => ({
  previewOf: (s: string) => `preview(${s})`,
}));

vi.mock('./slice', () => ({
  libraryActions: {
    setSelected: (id: string) => ({ type: 'library/setSelected', payload: id }),
  },
}));

import { LibraryNoteList } from './LibraryNoteList';

const note = (over: Partial<NoteDTO>): NoteDTO => ({
  id: '1',
  title: 'T',
  content: 'T\nbody',
  pinned: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

describe('LibraryNoteList (shallow)', () => {
  beforeEach(() => {
    dispatch.mockClear();
    state = { notes: [], query: '', selectedId: null, filter: 'all' };
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows the empty state when nothing matches the section', () => {
    render(<LibraryNoteList />);
    expect(screen.getByText('library.nothingFound')).toBeInTheDocument();
    expect(screen.getByText('library.emptySection')).toBeInTheDocument();
  });

  it('shows the query-no-match label when a query is active', () => {
    state = { ...state, query: 'xyz' };
    render(<LibraryNoteList />);
    expect(screen.getByText('library.queryNoMatch')).toBeInTheDocument();
  });

  it('shows "results" as the list title when a query is active', () => {
    state = { ...state, query: 'xyz' };
    render(<LibraryNoteList />);
    expect(screen.getByText('library.results')).toBeInTheDocument();
  });

  it('shows "pinned" as title when filter=pinned and no query', () => {
    state = { ...state, filter: 'pinned' };
    render(<LibraryNoteList />);
    expect(screen.getByText('library.pinned')).toBeInTheDocument();
  });

  it('renders a card per note, marking the selected one as aria-current', () => {
    state = {
      ...state,
      notes: [note({ id: '1', title: 'one' }), note({ id: '2', title: 'two' })],
      selectedId: '2',
    };
    render(<LibraryNoteList />);

    const cardOne = screen.getByTestId('note-card-1');
    const cardTwo = screen.getByTestId('note-card-2');
    expect(cardOne).toHaveAttribute('aria-current', 'false');
    expect(cardTwo).toHaveAttribute('aria-current', 'true');
  });

  it('dispatches setSelected when a card is clicked', () => {
    state = { ...state, notes: [note({ id: '42' })] };
    render(<LibraryNoteList />);
    fireEvent.click(screen.getByTestId('note-card-42'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/setSelected', payload: '42' });
  });

  it('falls back to "library.untitled" when a note has no title', () => {
    state = { ...state, notes: [note({ id: 'x', title: '' })] };
    render(<LibraryNoteList />);
    expect(screen.getByText('library.untitled')).toBeInTheDocument();
  });

  it('renders the relative-time label per range', () => {
    const now = Date.now();
    state = {
      ...state,
      notes: [
        note({ id: 'a', updatedAt: new Date(now - 30 * 1000).toISOString() }),
        note({ id: 'b', updatedAt: new Date(now - 5 * 60 * 1000).toISOString() }),
        note({ id: 'c', updatedAt: new Date(now - 3 * 3600 * 1000).toISOString() }),
        note({ id: 'd', updatedAt: new Date(now - 2 * 86_400_000).toISOString() }),
      ],
    };
    render(<LibraryNoteList />);
    expect(screen.getByText('time.justNow')).toBeInTheDocument();
    expect(screen.getByText('time.minutesAgo')).toBeInTheDocument();
    expect(screen.getByText('time.hoursAgo')).toBeInTheDocument();
    expect(screen.getByText('time.daysAgo')).toBeInTheDocument();
  });
});
