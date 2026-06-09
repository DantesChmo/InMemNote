import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dispatch = vi.fn();
let state = {
  notes: [
    { id: '1', title: 'A', content: 'A', pinned: true, createdAt: '', updatedAt: '' },
    { id: '2', title: 'B', content: 'B', pinned: false, createdAt: '', updatedAt: '' },
    { id: '3', title: 'C', content: 'C', pinned: false, createdAt: '', updatedAt: '' },
  ],
  filter: 'all' as 'all' | 'pinned',
  query: '',
};

vi.mock('@presentation/app/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (sel: (s: { library: typeof state }) => unknown) => sel({ library: state }),
}));

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({ locale: 'en' as const, t: (k: string) => k }),
}));

vi.mock('./slice', () => ({
  fetchNotes: () => ({ type: 'library/fetchNotes' }),
  libraryActions: {
    setFilter: (v: string) => ({ type: 'library/setFilter', payload: v }),
  },
}));

import { LibrarySidebar } from './LibrarySidebar';

describe('LibrarySidebar (shallow)', () => {
  beforeEach(() => {
    dispatch.mockClear();
    state = {
      notes: [
        { id: '1', title: 'A', content: 'A', pinned: true, createdAt: '', updatedAt: '' },
        { id: '2', title: 'B', content: 'B', pinned: false, createdAt: '', updatedAt: '' },
        { id: '3', title: 'C', content: 'C', pinned: false, createdAt: '', updatedAt: '' },
      ],
      filter: 'all',
      query: '',
    };
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders the title label and both filter items with counts', () => {
    render(<LibrarySidebar />);

    expect(screen.getByText('library.title')).toBeInTheDocument();
    expect(screen.getByText('library.allNotes')).toBeInTheDocument();
    expect(screen.getByText('library.pinned')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // all
    expect(screen.getByText('1')).toBeInTheDocument(); // pinned
  });

  it('dispatches setFilter + fetchNotes when a row is clicked', () => {
    render(<LibrarySidebar />);
    fireEvent.click(screen.getByText('library.pinned'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/setFilter', payload: 'pinned' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/fetchNotes' });
  });

  it('marks "Pinned" active when filter=pinned and no query', () => {
    state = { ...state, filter: 'pinned' };
    render(<LibrarySidebar />);

    const pinnedRow = screen.getByText('library.pinned').closest('button')!;
    expect(pinnedRow.className).toContain('accent-tint');
  });

  it('does NOT mark any row active when a search query is active', () => {
    state = { ...state, query: 'hello' };
    render(<LibrarySidebar />);
    const allRow = screen.getByText('library.allNotes').closest('button')!;
    expect(allRow.className).not.toContain('accent-tint');
  });
});
