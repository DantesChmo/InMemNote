import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dispatch = vi.fn();
let state = { query: '' };

vi.mock('@presentation/app/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (sel: (s: { library: typeof state }) => unknown) => sel({ library: state }),
}));

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({ locale: 'en' as const, t: (k: string) => k }),
}));

vi.mock('@presentation/settings/slice', () => ({
  settingsActions: {
    openPopup: () => ({ type: 'settings/openPopup' }),
  },
}));

vi.mock('./slice', () => ({
  createNote: () => ({ type: 'library/createNote' }),
  fetchNotes: () => ({ type: 'library/fetchNotes' }),
  libraryActions: {
    setQuery: (q: string) => ({ type: 'library/setQuery', payload: q }),
  },
}));

import { LibraryToolbar } from './LibraryToolbar';

describe('LibraryToolbar (shallow)', () => {
  beforeEach(() => {
    dispatch.mockClear();
    state = { query: '' };
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders the search input with the placeholder and the new-note button', () => {
    render(<LibraryToolbar />);
    expect(screen.getByPlaceholderText('library.searchPlaceholder')).toBeInTheDocument();
    expect(screen.getByText('library.newNote')).toBeInTheDocument();
  });

  it('renders the ⌘F hint when query is empty', () => {
    render(<LibraryToolbar />);
    expect(screen.getByText('⌘F')).toBeInTheDocument();
  });

  it('renders the clear-search button when query is non-empty', () => {
    state = { query: 'foo' };
    render(<LibraryToolbar />);
    expect(screen.queryByText('⌘F')).toBeNull();
    expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
  });

  it('typing in the search input dispatches setQuery + fetchNotes', () => {
    render(<LibraryToolbar />);
    fireEvent.change(screen.getByPlaceholderText('library.searchPlaceholder'), {
      target: { value: 'abc' },
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/setQuery', payload: 'abc' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/fetchNotes' });
  });

  it('clicking the clear button resets the query', () => {
    state = { query: 'foo' };
    render(<LibraryToolbar />);
    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/setQuery', payload: '' });
  });

  it('clicking the settings cog opens the settings popup', () => {
    render(<LibraryToolbar />);
    fireEvent.click(screen.getByLabelText('settings.title'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'settings/openPopup' });
  });

  it('clicking the "new note" button dispatches createNote', () => {
    render(<LibraryToolbar />);
    fireEvent.click(screen.getByText('library.newNote'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/createNote' });
  });

  it('⌘N focuses creates a note', () => {
    render(<LibraryToolbar />);
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/createNote' });
  });

  it('⌘F focuses the search input', () => {
    render(<LibraryToolbar />);
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(document.activeElement).toBe(
      screen.getByPlaceholderText('library.searchPlaceholder'),
    );
  });

  it('Escape on the focused search input clears the query', () => {
    state = { query: 'foo' };
    render(<LibraryToolbar />);
    const input = screen.getByPlaceholderText('library.searchPlaceholder');
    input.focus();
    dispatch.mockClear();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/setQuery', payload: '' });
  });
});
