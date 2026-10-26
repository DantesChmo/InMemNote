import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emptyDraftDTO, installInmemnoteApiMock } from '../../test/mockInmemnoteApi';

import { DraftPanel } from './DraftPanel';

import type { InmemnoteAPI, StorageStatusDTO } from '@shared/ipc';

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
      onDoubleClick={props.onResetPinSize}
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

vi.mock('@presentation/storage/StorageBanner', () => ({
  StorageBanner: (props: { variant?: string }) => (
    <div data-testid="stub-storage-banner" data-variant={props.variant ?? 'full'} />
  ),
}));
vi.mock('@presentation/storage/slice', () => ({
  fetchStorageStatus: () => ({ type: 'storage/fetchStatus' }),
  storageActions: {
    setStatus: (s: unknown) => ({ type: 'storage/setStatus', payload: s }),
  },
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

  it('asks main for the storage status on mount and renders the compact storage banner', async () => {
    await act(async () => {
      render(<DraftPanel />);
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'storage/fetchStatus' });
    expect(screen.getByTestId('stub-storage-banner')).toHaveAttribute('data-variant', 'compact');
  });

  it('applies storage:changed broadcasts and unsubscribes on unmount', async () => {
    let push: ((s: StorageStatusDTO) => void) | null = null;
    const unsubscribe = vi.fn();
    (api.storage.onChanged as ReturnType<typeof vi.fn>).mockImplementation(
      (h: (s: StorageStatusDTO) => void) => {
        push = h;
        return unsubscribe;
      },
    );
    const status: StorageStatusDTO = {
      degraded: [{ store: 'drafts', reason: 'database or disk is full' }],
    };

    let unmount: () => void = () => undefined;
    await act(async () => {
      ({ unmount } = render(<DraftPanel />));
    });
    await act(async () => push!(status));

    expect(dispatch).toHaveBeenCalledWith({ type: 'storage/setStatus', payload: status });
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
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
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'draft/setDraft' }));
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
      screen
        .getByTestId('stub-editor')
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
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

  describe('pending autosave is flushed on unload, never dropped or doubled', () => {
    // Types into the editor stub, leaving a 'typed' save waiting out the debounce.
    const typeMidDebounce = async (): Promise<void> => {
      await act(async () => {
        render(<DraftPanel />);
      });
      await act(async () => {
        screen.getByTestId('stub-editor').click();
      });
      expect(api.draft.save).not.toHaveBeenCalled();
    };

    const unload = async (): Promise<void> => {
      await act(async () => {
        window.dispatchEvent(new Event('beforeunload'));
      });
    };

    it('flushes on beforeunload (app quit, update relaunch, window destroy)', async () => {
      vi.useFakeTimers();
      try {
        await typeMidDebounce();
        await unload();

        expect(api.draft.save).toHaveBeenCalledTimes(1);
        expect(api.draft.save).toHaveBeenCalledWith('draft-1', 'typed');

        // The flushed debounce must not write a second time.
        await act(async () => {
          vi.advanceTimersByTime(600);
        });
        expect(api.draft.save).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('saves nothing on beforeunload when no edit is pending', async () => {
      vi.useFakeTimers();
      try {
        await typeMidDebounce();
        await act(async () => {
          vi.advanceTimersByTime(600);
        });
        expect(api.draft.save).toHaveBeenCalledTimes(1);

        await unload();
        expect(api.draft.save).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('submit mid-debounce saves once; a later unload adds nothing', async () => {
      vi.useFakeTimers();
      try {
        await typeMidDebounce();
        await act(async () => {
          screen
            .getByTestId('stub-editor')
            .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        });
        await unload();
        await act(async () => {
          vi.advanceTimersByTime(600);
        });

        expect(api.draft.save).toHaveBeenCalledTimes(1);
        expect(api.draft.promote).toHaveBeenCalledWith('draft-1');
      } finally {
        vi.useRealTimers();
      }
    });

    it('cancel mid-debounce saves once; a later unload adds nothing', async () => {
      vi.useFakeTimers();
      try {
        await typeMidDebounce();
        await act(async () => {
          screen
            .getByTestId('stub-editor')
            .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
        });
        await unload();
        await act(async () => {
          vi.advanceTimersByTime(600);
        });

        expect(api.draft.save).toHaveBeenCalledTimes(1);
        expect(api.draft.close).toHaveBeenCalledWith('draft-1');
      } finally {
        vi.useRealTimers();
      }
    });

    it('pin toggle mid-debounce saves once; a later unload adds nothing', async () => {
      vi.useFakeTimers();
      try {
        await typeMidDebounce();
        await act(async () => {
          screen.getByTestId('stub-draft-header').click();
        });
        await unload();
        await act(async () => {
          vi.advanceTimersByTime(600);
        });

        expect(api.draft.save).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
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

// The behaviours below are the documented rules around the edges of the
// panel: re-summon, "exactly one save" per exit path (bugs #02, #06, #07),
// the in-memory storage strip in both modes (bug #03) and the renderer-side
// window sizing contract (TZ 2.2, 2.3).
describe('DraftPanel — exits, re-summon, sizing', () => {
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
    vi.unstubAllGlobals();
  });

  // Captures the handler a `window.inmemnote` subscriber was registered with.
  function capture<T>(subscribe: unknown): { fire: (v: T) => void } {
    const box: { handler: ((v: T) => void) | null } = { handler: null };
    (subscribe as ReturnType<typeof vi.fn>).mockImplementation((h: (v: T) => void) => {
      box.handler = h;
      return () => undefined;
    });
    return { fire: (v) => box.handler?.(v) };
  }

  const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

  describe('re-summon', () => {
    it('re-opens the draft each time main reports the hotkey', async () => {
      const hotkey = capture<void>(api.draft.onHotkey);
      await act(async () => {
        render(<DraftPanel />);
      });
      expect(api.draft.open).toHaveBeenCalledTimes(1);
      (api.draft.open as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        emptyDraftDTO({ id: 'draft-2', content: 'back again' }),
      );
      dispatch.mockClear();

      await act(async () => hotkey.fire());

      expect(api.draft.open).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith({ type: 'draft/setLoading', payload: true });
      expect(dispatch).toHaveBeenCalledWith({
        type: 'draft/setDraft',
        payload: expect.objectContaining({ id: 'draft-2', content: 'back again' }),
      });
    });
  });

  describe('exits save exactly once', () => {
    it('document-level ⌘↵ saves once and promotes without closing', async () => {
      await act(async () => {
        render(<DraftPanel />);
      });
      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
        );
      });

      expect(api.draft.save).toHaveBeenCalledTimes(1);
      expect(api.draft.save).toHaveBeenCalledWith('draft-1', 'hello');
      expect(api.draft.promote).toHaveBeenCalledWith('draft-1');
      expect(api.draft.close).not.toHaveBeenCalled();
      expect(api.draft.hide).toHaveBeenCalledTimes(1);
    });

    it('document-level Esc saves once and closes without promoting', async () => {
      await act(async () => {
        render(<DraftPanel />);
      });
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(api.draft.save).toHaveBeenCalledTimes(1);
      expect(api.draft.close).toHaveBeenCalledWith('draft-1');
      expect(api.draft.promote).not.toHaveBeenCalled();
      expect(api.draft.hide).toHaveBeenCalledTimes(1);
    });

    it('a plain Enter does not submit', async () => {
      await act(async () => {
        render(<DraftPanel />);
      });
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      expect(api.draft.promote).not.toHaveBeenCalled();
      expect(api.draft.hide).not.toHaveBeenCalled();
    });

    it('still clears and hides when promoting fails, so the panel never sticks open', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      (api.draft.promote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
      await act(async () => {
        render(<DraftPanel />);
      });
      dispatch.mockClear();

      await act(async () => {
        screen
          .getByTestId('stub-editor')
          .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(dispatch).toHaveBeenCalledWith({ type: 'draft/clear' });
      expect(api.draft.hide).toHaveBeenCalledTimes(1);
    });

    it('does nothing on ⌘↵ before a draft has been loaded', async () => {
      selectorState = { ...selectorState, id: null as unknown as string };
      await act(async () => {
        render(<DraftPanel />);
      });
      await act(async () => {
        screen
          .getByTestId('stub-editor')
          .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(api.draft.save).not.toHaveBeenCalled();
      expect(api.draft.promote).not.toHaveBeenCalled();
      expect(api.draft.hide).not.toHaveBeenCalled();
    });

    it('keeps the on-screen text but schedules no save while no draft is loaded', async () => {
      vi.useFakeTimers();
      try {
        selectorState = { ...selectorState, id: null as unknown as string };
        await act(async () => {
          render(<DraftPanel />);
        });
        dispatch.mockClear();

        await act(async () => {
          screen.getByTestId('stub-editor').click();
        });
        await act(async () => {
          vi.advanceTimersByTime(600);
        });

        expect(dispatch).toHaveBeenCalledWith({ type: 'draft/editContent', payload: 'typed' });
        expect(api.draft.save).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a failed autosave is swallowed and the next edit saves again', async () => {
      vi.useFakeTimers();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        (api.draft.save as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('disk'));
        await act(async () => {
          render(<DraftPanel />);
        });
        await act(async () => {
          screen.getByTestId('stub-editor').click();
        });
        await act(async () => {
          vi.advanceTimersByTime(600);
        });
        await act(async () => {
          screen.getByTestId('stub-editor').click();
        });
        await act(async () => {
          vi.advanceTimersByTime(600);
        });

        expect(api.draft.save).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('storage strip (bug #03)', () => {
    it('shows the compact "not saved" strip while un-pinned', async () => {
      await act(async () => {
        render(<DraftPanel />);
      });
      expect(screen.getByTestId('stub-storage-banner')).toHaveAttribute('data-variant', 'compact');
    });

    it('keeps the strip in pinned mode too', async () => {
      selectorState = { ...selectorState, pinned: true };
      await act(async () => {
        render(<DraftPanel />);
      });
      expect(screen.getByTestId('stub-storage-banner')).toHaveAttribute('data-variant', 'compact');
    });
  });

  describe('pin toggle', () => {
    it('flips the flag optimistically, then adopts the draft main returns', async () => {
      const measured = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockReturnValue({ height: 123.2 } as DOMRect);
      (api.draft.togglePin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        emptyDraftDTO({ id: 'draft-1', content: 'hello', pinned: true, updatedAt: 'later' }),
      );
      await act(async () => {
        render(<DraftPanel />);
      });
      dispatch.mockClear();

      await act(async () => {
        screen.getByTestId('stub-draft-header').click();
      });
      // Before main answers, the local pinned flag is already flipped.
      await act(async () => {
        await nextFrame();
        await nextFrame();
      });

      // Target height is the measured panel height, rounded up.
      expect(api.draft.togglePin).toHaveBeenCalledWith('draft-1', 124);
      expect(measured).toHaveBeenCalled();
      const setDrafts = dispatch.mock.calls
        .map(([a]) => a as { type: string; payload: { pinned: boolean; updatedAt: string } })
        .filter((a) => a.type === 'draft/setDraft');
      expect(setDrafts[0]?.payload).toMatchObject({
        pinned: true,
        updatedAt: selectorState.updatedAt,
      });
      expect(setDrafts.at(-1)?.payload).toMatchObject({ pinned: true, updatedAt: 'later' });
    });

    it('does nothing before a draft has been loaded', async () => {
      selectorState = { ...selectorState, id: null as unknown as string };
      await act(async () => {
        render(<DraftPanel />);
      });
      await act(async () => {
        screen.getByTestId('stub-draft-header').click();
      });
      await act(async () => {
        await nextFrame();
        await nextFrame();
      });

      expect(api.draft.save).not.toHaveBeenCalled();
      expect(api.draft.togglePin).not.toHaveBeenCalled();
    });

    it('still toggles when the pre-pin save fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      (api.draft.save as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('disk'));
      await act(async () => {
        render(<DraftPanel />);
      });

      await act(async () => {
        screen.getByTestId('stub-draft-header').click();
      });
      await act(async () => {
        await nextFrame();
        await nextFrame();
      });

      expect(api.draft.togglePin).toHaveBeenCalledWith('draft-1', expect.any(Number));
    });
  });

  describe('custom pinned size', () => {
    it('offers "reset size" only while pinned and custom-sized, and forwards it to main', async () => {
      selectorState = { ...selectorState, pinned: true };
      const custom = capture<boolean>(api.draft.onCustomSizeChanged);
      let rerender: (ui: JSX.Element) => void = () => undefined;
      await act(async () => {
        ({ rerender } = render(<DraftPanel />));
      });
      const header = screen.getByTestId('stub-draft-header');
      expect(header).toHaveAttribute('data-reset-available', 'false');

      await act(async () => custom.fire(true));
      expect(header).toHaveAttribute('data-reset-available', 'true');
      header.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(api.draft.resetPinSize).toHaveBeenCalledTimes(1);

      // Un-pinning forgets the custom size so the next pin starts in auto mode.
      selectorState = { ...selectorState, pinned: false };
      await act(async () => rerender(<DraftPanel />));
      expect(screen.getByTestId('stub-draft-header')).toHaveAttribute(
        'data-reset-available',
        'false',
      );
    });

    it('moves the resize handle when main reports a new corner', async () => {
      selectorState = { ...selectorState, pinned: true };
      const corner = capture<string>(api.draft.onCornerChanged);
      await act(async () => {
        render(<DraftPanel />);
      });
      expect(screen.getByTestId('stub-resize-handle')).toHaveAttribute('data-corner', 'tr');

      await act(async () => corner.fire('br'));
      expect(screen.getByTestId('stub-resize-handle')).toHaveAttribute('data-corner', 'br');
    });
  });

  describe('drag overlay', () => {
    const overlay = (c: HTMLElement): Element | null => c.querySelector('[aria-hidden="true"]');

    it('shows while the window is dragged and goes away on drag end', async () => {
      const start = capture<void>(api.draft.onDragStart);
      const end = capture<void>(api.draft.onDragEnd);
      let container!: HTMLElement;
      await act(async () => {
        ({ container } = render(<DraftPanel />));
      });
      expect(overlay(container)).toBeNull();

      await act(async () => start.fire());
      expect(overlay(container)).not.toBeNull();
      await act(async () => end.fire());
      expect(overlay(container)).toBeNull();
    });

    it('stays through the snap animation and only drops when it comes to rest', async () => {
      const start = capture<void>(api.draft.onDragStart);
      const done = capture<void>(api.draft.onAnimationDone);
      let container!: HTMLElement;
      await act(async () => {
        ({ container } = render(<DraftPanel />));
      });

      await act(async () => start.fire());
      expect(overlay(container)).not.toBeNull();
      await act(async () => done.fire());
      expect(overlay(container)).toBeNull();
    });
  });

  describe('height reporting (ResizeObserver → draft.resize)', () => {
    type Entry = { borderBoxSize?: { blockSize: number }[]; contentRect: { height: number } };
    let trigger: (entry: Entry) => void;
    let disconnected: boolean;

    beforeEach(() => {
      disconnected = false;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(cb: (entries: Entry[]) => void) {
            trigger = (e) => cb([e]);
          }
          observe(): void {}
          disconnect(): void {
            disconnected = true;
          }
        },
      );
    });

    it('reports the panel border-box height, rounded up', async () => {
      await act(async () => {
        render(<DraftPanel />);
      });
      trigger({ borderBoxSize: [{ blockSize: 200.2 }], contentRect: { height: 10 } });
      await act(async () => nextFrame());

      expect(api.draft.resize).toHaveBeenCalledTimes(1);
      expect(api.draft.resize).toHaveBeenCalledWith(201);
    });

    it('falls back to the content rect when border-box size is unavailable', async () => {
      await act(async () => {
        render(<DraftPanel />);
      });
      trigger({ contentRect: { height: 150 } });
      await act(async () => nextFrame());

      expect(api.draft.resize).toHaveBeenCalledWith(150);
    });

    it('coalesces a burst of layout shifts into one report of the last height', async () => {
      await act(async () => {
        render(<DraftPanel />);
      });
      trigger({ contentRect: { height: 100 } });
      trigger({ contentRect: { height: 120 } });
      trigger({ contentRect: { height: 140 } });
      await act(async () => nextFrame());

      expect(api.draft.resize).toHaveBeenCalledTimes(1);
      expect(api.draft.resize).toHaveBeenCalledWith(140);
    });

    it('stays silent while main animates the window, then pushes the settled height', async () => {
      const animStart = capture<void>(api.draft.onAnimationStart);
      const animDone = capture<void>(api.draft.onAnimationDone);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        height: 321.5,
      } as DOMRect);
      await act(async () => {
        render(<DraftPanel />);
      });

      await act(async () => animStart.fire());
      trigger({ contentRect: { height: 200 } });
      await act(async () => nextFrame());
      expect(api.draft.resize).not.toHaveBeenCalled();

      await act(async () => animDone.fire());
      expect(api.draft.resize).toHaveBeenCalledTimes(1);
      expect(api.draft.resize).toHaveBeenCalledWith(322);

      // Reporting resumes once the animation is over.
      trigger({ contentRect: { height: 250 } });
      await act(async () => nextFrame());
      expect(api.draft.resize).toHaveBeenLastCalledWith(250);
    });

    it('drops a report still queued when the panel unmounts', async () => {
      let unmount: () => void = () => undefined;
      await act(async () => {
        ({ unmount } = render(<DraftPanel />));
      });
      trigger({ contentRect: { height: 200 } });
      unmount();
      await nextFrame();

      expect(disconnected).toBe(true);
      expect(api.draft.resize).not.toHaveBeenCalled();
    });
  });
});
