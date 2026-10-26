import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { noteDTO } from '../../test/mockInmemnoteApi';

import type { PendingDelete } from './slice';

const dispatch = vi.fn();
let state: { pendingDelete: PendingDelete | null } = { pendingDelete: null };

vi.mock('@presentation/app/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (sel: (s: { library: typeof state }) => unknown) => sel({ library: state }),
}));

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({ locale: 'en' as const, t: (k: string) => k }),
}));

vi.mock('./slice', () => ({
  commitDelete: (id: string) => ({ type: 'library/commitDelete', payload: id }),
  undoDelete: () => ({ type: 'library/undoDelete' }),
}));

// Component under test is imported after vi.mock blocks by design — see src/presentation/CLAUDE.md §4.
// eslint-disable-next-line import/order
import { UNDO_DELETE_MS, UndoDeleteToast } from './UndoDeleteToast';

const pending = (id: string): PendingDelete => ({ note: noteDTO({ id }), index: 0 });
const commitOf = (id: string) => ({ type: 'library/commitDelete', payload: id });
const UNDO = { type: 'library/undoDelete' };

function cmdZ(target: Element = document.body): void {
  fireEvent.keyDown(target, { key: 'z', metaKey: true });
}

describe('UndoDeleteToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dispatch.mockClear();
    state = { pendingDelete: null };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps an empty live region mounted when nothing is pending', () => {
    render(<UndoDeleteToast />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(screen.queryByTestId('lib-undo-toast')).toBeNull();
  });

  it('shows the toast with an Undo button for a pending delete', () => {
    state = { pendingDelete: pending('n1') };
    render(<UndoDeleteToast />);
    expect(screen.getByTestId('lib-undo-toast')).toBeInTheDocument();
    expect(screen.getByText('library.toast.noteDeleted')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('lib-undo-btn'));
    expect(dispatch).toHaveBeenCalledWith(UNDO);
  });

  it('commits the delete once the undo window runs out', () => {
    state = { pendingDelete: pending('n1') };
    render(<UndoDeleteToast />);

    act(() => vi.advanceTimersByTime(UNDO_DELETE_MS - 1));
    expect(dispatch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(dispatch).toHaveBeenCalledWith(commitOf('n1'));
  });

  it('commits right away when the toast is dismissed', () => {
    state = { pendingDelete: pending('n1') };
    render(<UndoDeleteToast />);
    fireEvent.click(screen.getByTestId('lib-undo-dismiss'));
    expect(dispatch).toHaveBeenCalledWith(commitOf('n1'));
  });

  it('commits the pending delete when the window unloads', () => {
    state = { pendingDelete: pending('n1') };
    render(<UndoDeleteToast />);
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(dispatch).toHaveBeenCalledWith(commitOf('n1'));
  });

  it('pauses the timer while hovered and resumes with the time that was left', () => {
    state = { pendingDelete: pending('n1') };
    render(<UndoDeleteToast />);
    const toast = screen.getByTestId('lib-undo-toast');

    act(() => vi.advanceTimersByTime(1000));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(60_000));
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(UNDO_DELETE_MS - 1000 - 1));
    expect(dispatch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(dispatch).toHaveBeenCalledWith(commitOf('n1'));
  });

  it('leaves at least two seconds after a pause near the end', () => {
    state = { pendingDelete: pending('n1') };
    render(<UndoDeleteToast />);
    const toast = screen.getByTestId('lib-undo-toast');

    act(() => vi.advanceTimersByTime(UNDO_DELETE_MS - 500));
    fireEvent.focus(screen.getByTestId('lib-undo-btn'));
    fireEvent.blur(screen.getByTestId('lib-undo-btn'));
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(1999));
    expect(dispatch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(dispatch).toHaveBeenCalledWith(commitOf('n1'));
  });

  it('restarts the full window when a new delete replaces the pending one', () => {
    state = { pendingDelete: pending('n1') };
    const { rerender } = render(<UndoDeleteToast />);
    act(() => vi.advanceTimersByTime(4000));

    state = { pendingDelete: pending('n2') };
    rerender(<UndoDeleteToast />);
    act(() => vi.advanceTimersByTime(UNDO_DELETE_MS - 1));
    expect(dispatch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(dispatch).toHaveBeenCalledWith(commitOf('n2'));
    expect(dispatch).not.toHaveBeenCalledWith(commitOf('n1'));
  });

  it('⌘Z undoes when focus is outside any text field', () => {
    state = { pendingDelete: pending('n1') };
    render(<UndoDeleteToast />);
    cmdZ();
    expect(dispatch).toHaveBeenCalledWith(UNDO);
  });

  it('⌘Z inside the editor or an input is left to that field', () => {
    state = { pendingDelete: pending('n1') };
    render(
      <>
        <div className="cm-editor">
          <div data-testid="cm-content" />
        </div>
        <input data-testid="search" />
        <UndoDeleteToast />
      </>,
    );
    cmdZ(screen.getByTestId('cm-content'));
    cmdZ(screen.getByTestId('search'));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('⌘Z does nothing when no delete is pending', () => {
    render(<UndoDeleteToast />);
    cmdZ();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
