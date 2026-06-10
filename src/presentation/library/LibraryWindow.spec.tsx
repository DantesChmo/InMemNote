import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installInmemnoteApiMock } from '../../test/mockInmemnoteApi';

import { LibraryWindow } from './LibraryWindow';

import type { InmemnoteAPI } from '@infrastructure/electron/preload/index';

const dispatch = vi.fn();

vi.mock('@presentation/app/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: () => undefined,
}));

vi.mock('@presentation/settings/SettingsPopup', () => ({
  SettingsPopup: () => <div data-testid="stub-settings-popup" />,
}));

vi.mock('@presentation/settings/slice', () => ({
  fetchSettings: () => ({ type: 'settings/fetch' }),
}));

vi.mock('./LibraryToolbar', () => ({
  LibraryToolbar: () => <div data-testid="stub-toolbar" />,
}));
vi.mock('./LibrarySidebar', () => ({
  LibrarySidebar: () => <div data-testid="stub-sidebar" />,
}));
vi.mock('./LibraryNoteList', () => ({
  LibraryNoteList: () => <div data-testid="stub-list" />,
}));
vi.mock('./LibraryEditor', () => ({
  LibraryEditor: () => <div data-testid="stub-editor" />,
}));
vi.mock('./slice', () => ({
  fetchNotes: () => ({ type: 'library/fetchNotes' }),
}));


describe('LibraryWindow (shallow)', () => {
  let api: InmemnoteAPI;

  beforeEach(() => {
    dispatch.mockClear();
    api = installInmemnoteApiMock();
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders all four section stubs and the settings popup', async () => {
    await act(async () => {
      render(<LibraryWindow />);
    });

    expect(screen.getByTestId('stub-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('stub-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('stub-list')).toBeInTheDocument();
    expect(screen.getByTestId('stub-editor')).toBeInTheDocument();
    expect(screen.getByTestId('stub-settings-popup')).toBeInTheDocument();
  });

  it('kicks the initial fetchNotes + fetchSettings on mount and subscribes to notes:changed', async () => {
    await act(async () => {
      render(<LibraryWindow />);
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'library/fetchNotes' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'settings/fetch' });
    expect(api.notes.onChanged).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when the notes:changed broadcast fires', async () => {
    let push: (() => void) | null = null;
    (api.notes.onChanged as ReturnType<typeof vi.fn>).mockImplementation(
      (h: () => void) => {
        push = h;
        return () => undefined;
      },
    );

    await act(async () => {
      render(<LibraryWindow />);
    });
    dispatch.mockClear();
    await act(async () => push!());

    expect(dispatch).toHaveBeenCalledWith({ type: 'library/fetchNotes' });
  });
});
