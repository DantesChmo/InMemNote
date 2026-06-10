import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emptyDraftDTO, installInmemnoteApiMock } from '../../test/mockInmemnoteApi';

import { DraftPanel } from './DraftPanel';

import type { InmemnoteAPI } from '@infrastructure/electron/preload/index';

// ---- Module-level mocks ----
//
// DraftPanel composes a handful of children + Redux + i18n; this is the
// canonical place to do shallow rendering — every collaborator is replaced by
// a dumb stub whose role is to surface the props it received.

const dispatch = vi.fn();
let selectorState = {
  id: 'draft-1',
  content: 'hello',
  pinned: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
  loading: false,
};

vi.mock('@presentation/app/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: { draft: typeof selectorState }) => unknown) =>
    selector({ draft: selectorState }),
}));

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({ locale: 'en' as const, t: (key: string) => key }),
}));

vi.mock('./DraftHeader', () => ({
  DraftHeader: (props: {
    pinned: boolean;
    onTogglePin: () => void;
    onResetPinSize?: () => void;
  }) => (
    <div
      data-testid="stub-draft-header"
      data-pinned={String(props.pinned)}
      data-reset-available={String(props.onResetPinSize !== undefined)}
      onClick={props.onTogglePin}
    />
  ),
}));

vi.mock('./DraftFooter', () => ({
  DraftFooter: () => <div data-testid="stub-draft-footer" />,
}));

vi.mock('./ResizeHandle', () => ({
  ResizeHandle: (props: { pinnedCorner: string }) => (
    <div data-testid="stub-resize-handle" data-corner={props.pinnedCorner} />
  ),
}));

vi.mock('./editor/CodeMirrorEditor', () => ({
  CodeMirrorEditor: (props: {
    value: string;
    placeholder?: string;
    onChange: (next: string) => void;
    onSubmit?: () => void;
    onCancel?: () => void;
  }) => (
    <div
      data-testid="stub-editor"
      data-value={props.value}
      data-placeholder={props.placeholder}
      // Test hooks for triggering callbacks.
      onClick={() => props.onChange('typed')}
      onDoubleClick={() => props.onSubmit?.()}
      onContextMenu={() => props.onCancel?.()}
    />
  ),
}));

vi.mock('./slice', () => ({
  draftActions: {
    setLoading: (v: boolean) => ({ type: 'draft/setLoading', payload: v }),
    setDraft: (v: unknown) => ({ type: 'draft/setDraft', payload: v }),
    editContent: (v: string) => ({ type: 'draft/editContent', payload: v }),
    clear: () => ({ type: 'draft/clear' }),
  },
}));

// Import AFTER all mocks are declared.

describe('DraftPanel (shallow)', () => {
  let api: InmemnoteAPI;

  beforeEach(() => {
    dispatch.mockClear();
    selectorState = {
      id: 'draft-1',
      content: 'hello',
      pinned: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
      loading: false,
    };
    api = installInmemnoteApiMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders header, footer and editor stubs with the slice state', async () => {
    await act(async () => {
      render(<DraftPanel />);
    });

    expect(screen.getByTestId('stub-draft-header')).toHaveAttribute('data-pinned', 'false');
    expect(screen.getByTestId('stub-draft-footer')).toBeInTheDocument();
    const editor = screen.getByTestId('stub-editor');
    expect(editor).toHaveAttribute('data-value', 'hello');
    expect(editor).toHaveAttribute('data-placeholder', 'draft.placeholder');
    // No ResizeHandle while un-pinned.
    expect(screen.queryByTestId('stub-resize-handle')).toBeNull();
  });

  it('calls draft.open on mount and seeds Redux from the result', async () => {
    (api.draft.open as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      emptyDraftDTO({ id: 'X', content: 'hi', pinned: false }),
    );

    await act(async () => {
      render(<DraftPanel />);
    });

    expect(api.draft.open).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'draft/setLoading', payload: true });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'draft/setDraft' }),
    );
  });

  it('forwards editor.onChange to a debounced draft/editContent dispatch', async () => {
    vi.useFakeTimers();
    try {
      await act(async () => {
        render(<DraftPanel />);
      });
      dispatch.mockClear();
      const editor = screen.getByTestId('stub-editor');

      await act(async () => {
        editor.click(); // stub onChange
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: 'draft/editContent',
        payload: 'typed',
      });
      expect(api.draft.save).not.toHaveBeenCalled();

      // Flush debounce — should land a save.
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(api.draft.save).toHaveBeenCalledWith('draft-1', 'typed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('promotes the draft and hides the window on submit', async () => {
    await act(async () => {
      render(<DraftPanel />);
    });
    dispatch.mockClear();

    const editor = screen.getByTestId('stub-editor');
    await act(async () => {
      editor.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    // promote + hide + clear dispatch
    expect(api.draft.save).toHaveBeenCalledWith('draft-1', 'hello');
    expect(api.draft.promote).toHaveBeenCalledWith('draft-1');
    expect(api.draft.hide).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'draft/clear' });
  });

  it('on cancel: flushes save, closes, hides', async () => {
    await act(async () => {
      render(<DraftPanel />);
    });

    const editor = screen.getByTestId('stub-editor');
    await act(async () => {
      editor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    });

    expect(api.draft.save).toHaveBeenCalledWith('draft-1', 'hello');
    expect(api.draft.close).toHaveBeenCalledWith('draft-1');
    expect(api.draft.hide).toHaveBeenCalled();
  });

  it('on cancel with no draft id: just hides', async () => {
    selectorState = { ...selectorState, id: null as unknown as string };
    await act(async () => {
      render(<DraftPanel />);
    });
    await act(async () => {
      screen.getByTestId('stub-editor').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true }),
      );
    });
    expect(api.draft.hide).toHaveBeenCalled();
    expect(api.draft.close).not.toHaveBeenCalled();
  });

  it('document-level ⌘↵ triggers submit', async () => {
    await act(async () => {
      render(<DraftPanel />);
    });
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
      );
    });
    expect(api.draft.promote).toHaveBeenCalledWith('draft-1');
  });

  it('document-level Escape triggers cancel', async () => {
    await act(async () => {
      render(<DraftPanel />);
    });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(api.draft.hide).toHaveBeenCalled();
  });

  it('renders ResizeHandle while pinned with the corner reported by main', async () => {
    selectorState = { ...selectorState, pinned: true };
    (api.draft.getCorner as ReturnType<typeof vi.fn>).mockResolvedValueOnce('bl');

    await act(async () => {
      render(<DraftPanel />);
    });
    const handle = screen.getByTestId('stub-resize-handle');
    expect(handle).toHaveAttribute('data-corner', 'bl');
  });

  it('subscribes to hotkey/drag/animation/corner/custom-size IPC streams', async () => {
    await act(async () => {
      render(<DraftPanel />);
    });
    expect(api.draft.onHotkey).toHaveBeenCalled();
    expect(api.draft.onDragStart).toHaveBeenCalled();
    expect(api.draft.onDragEnd).toHaveBeenCalled();
    expect(api.draft.onAnimationStart).toHaveBeenCalled();
    expect(api.draft.onAnimationDone).toHaveBeenCalled();
    expect(api.draft.onCornerChanged).toHaveBeenCalled();
    expect(api.draft.onCustomSizeChanged).toHaveBeenCalled();
  });

  it('toggling pin via the header stub passes a measured target height', async () => {
    await act(async () => {
      render(<DraftPanel />);
    });
    dispatch.mockClear();

    await act(async () => {
      screen.getByTestId('stub-draft-header').click();
    });

    // Wait for the queued double-rAF.
    await act(async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    });

    expect(api.draft.save).toHaveBeenCalledWith('draft-1', 'hello');
    expect(api.draft.togglePin).toHaveBeenCalled();
  });
});
