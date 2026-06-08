import { IPC, type DraftDTO, type NoteDTO, type NoteListFilterDTO } from '@infrastructure/electron/ipc-channels';
import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script.
 *
 * Bridges the renderer (React) with the main process. We expose a narrow,
 * typed API on `window.inmemnote` — no raw `ipcRenderer`, no Node primitives.
 * Anything not listed here is unreachable from the UI; that's the security
 * boundary.
 */

const api = {
  draft: {
    open: (): Promise<DraftDTO> => ipcRenderer.invoke(IPC.DraftOpen),
    save: (id: string, content: string): Promise<DraftDTO> =>
      ipcRenderer.invoke(IPC.DraftSave, id, content),
    close: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DraftClose, id),
    togglePin: (id: string, targetHeight?: number): Promise<DraftDTO> =>
      ipcRenderer.invoke(IPC.DraftTogglePin, id, targetHeight),
    hide: (): Promise<void> => ipcRenderer.invoke(IPC.DraftHide),
    /**
     * Ask main to resize the BrowserWindow so its content area matches the
     * renderer's measured panel height. Width stays fixed (the design defines
     * a single width per mode). Main clamps the result to a sane range.
     */
    resize: (height: number): Promise<void> => ipcRenderer.invoke(IPC.DraftResize, height),
    /**
     * Move the current draft into the library (⌘↵). Returns the new note's
     * DTO, or `null` if the draft was empty and got silently discarded.
     */
    promote: (id: string): Promise<NoteDTO | null> => ipcRenderer.invoke(IPC.DraftPromote, id),
    /**
     * Subscribe to "the global hotkey was pressed" events from main.
     * Returns an unsubscribe function — callers must call it in `useEffect`
     * cleanup to avoid stacked listeners on hot-reload.
     */
    onHotkey: (handler: () => void): (() => void) => {
      const listener = () => handler();
      ipcRenderer.on('draft:hotkey', listener);
      return () => ipcRenderer.removeListener('draft:hotkey', listener);
    },
    /**
     * Subscribe to "the pin/unpin animation just finished" broadcasts.
     * Main drives the OS window animation itself; when it lands, the
     * renderer is expected to remeasure the panel and push the real,
     * content-fit height via `resize`.
     */
    onAnimationDone: (handler: () => void): (() => void) => {
      const listener = () => handler();
      ipcRenderer.on('draft:animationDone', listener);
      return () => ipcRenderer.removeListener('draft:animationDone', listener);
    },
    /**
     * Counterpart to `onAnimationDone`: lets the renderer freeze the
     * `ResizeObserver`-driven height updates while AppKit is animating.
     * Without this, every intermediate frame becomes an IPC roundtrip and
     * the resize-handler races the animation itself.
     */
    onAnimationStart: (handler: () => void): (() => void) => {
      const listener = () => handler();
      ipcRenderer.on('draft:animationStart', listener);
      return () => ipcRenderer.removeListener('draft:animationStart', listener);
    },
    /**
     * "User started dragging the pinned window by its header" — main
     * detects this via the `move` event on the BrowserWindow. The renderer
     * uses it to surface a tint overlay so the user sees their gesture is
     * being tracked.
     */
    onDragStart: (handler: () => void): (() => void) => {
      const listener = () => handler();
      ipcRenderer.on('draft:dragStart', listener);
      return () => ipcRenderer.removeListener('draft:dragStart', listener);
    },
    onDragEnd: (handler: () => void): (() => void) => {
      const listener = () => handler();
      ipcRenderer.on('draft:dragEnd', listener);
      return () => ipcRenderer.removeListener('draft:dragEnd', listener);
    },
    /**
     * Manually resize the pinned panel. Main clamps to the pin's
     * width/height bracket and re-anchors the window so the corner the
     * user is *not* dragging stays still.
     */
    setPinSize: (size: { width: number; height: number }): Promise<void> =>
      ipcRenderer.invoke(IPC.DraftSetPinSize, size),
    /** Drop any user-set custom size and animate back to the default. */
    resetPinSize: (): Promise<void> => ipcRenderer.invoke(IPC.DraftResetPinSize),
    /** Synchronously fetch the current pin corner ('tl' | 'tr' | 'bl' | 'br'). */
    getCorner: (): Promise<'tl' | 'tr' | 'bl' | 'br'> =>
      ipcRenderer.invoke(IPC.DraftGetCorner),
    /**
     * Subscribe to "user-customized-size" flag changes. `true` means the
     * pinned overlay should fill the window; `false` means content drives
     * height via the ResizeObserver path.
     */
    onCustomSizeChanged: (handler: (active: boolean) => void): (() => void) => {
      const listener = (_e: unknown, active: boolean): void => handler(active);
      ipcRenderer.on(IPC.DraftCustomSizeChanged, listener);
      return () => ipcRenderer.removeListener(IPC.DraftCustomSizeChanged, listener);
    },
    /**
     * Start tracking a resize drag. Main records the current cursor and
     * window state, then drives `setBounds` directly off the native AppKit
     * mouse-drag stream until the mouse is released. The renderer doesn't
     * need a `mousemove` listener at all.
     */
    beginResize: (): Promise<void> => ipcRenderer.invoke(IPC.DraftBeginResize),
    /**
     * Main broadcasts this every time the active pin corner changes
     * (drag-to-corner snap). Renderer uses it to position the resize
     * handle on the diagonally-opposite corner.
     */
    onCornerChanged: (handler: (corner: 'tl' | 'tr' | 'bl' | 'br') => void): (() => void) => {
      const listener = (_e: unknown, corner: 'tl' | 'tr' | 'bl' | 'br'): void =>
        handler(corner);
      ipcRenderer.on('draft:cornerChanged', listener);
      return () => ipcRenderer.removeListener('draft:cornerChanged', listener);
    },
    /**
     * Hover state for the pinned header. Source is `NSTrackingArea` on a
     * sensor subview in main, not CSS — `:hover` doesn't fire on
     * `-webkit-app-region: drag` zones, so this is the only way to know
     * the cursor is over the drag strip.
     */
    onHeaderHover: (handler: (hovering: boolean) => void): (() => void) => {
      const listener = (_e: unknown, hovering: boolean): void => handler(hovering);
      ipcRenderer.on(IPC.DraftHeaderHover, listener);
      return () => ipcRenderer.removeListener(IPC.DraftHeaderHover, listener);
    },
  },
  notes: {
    list: (filter: NoteListFilterDTO): Promise<NoteDTO[]> =>
      ipcRenderer.invoke(IPC.NotesList, filter),
    get: (id: string): Promise<NoteDTO | null> => ipcRenderer.invoke(IPC.NotesGet, id),
    create: (): Promise<NoteDTO> => ipcRenderer.invoke(IPC.NotesCreate),
    save: (id: string, content: string): Promise<NoteDTO> =>
      ipcRenderer.invoke(IPC.NotesSave, id, content),
    togglePin: (id: string): Promise<NoteDTO> => ipcRenderer.invoke(IPC.NotesTogglePin, id),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.NotesDelete, id),
    search: (query: string): Promise<NoteDTO[]> => ipcRenderer.invoke(IPC.NotesSearch, query),
    /**
     * Subscribe to "the library changed elsewhere" broadcasts so a Library
     * window stays in sync when, e.g., a draft was promoted.
     */
    onChanged: (handler: () => void): (() => void) => {
      const listener = () => handler();
      ipcRenderer.on(IPC.NotesChanged, listener);
      return () => ipcRenderer.removeListener(IPC.NotesChanged, listener);
    },
  },
};

export type InmemnoteAPI = typeof api;

contextBridge.exposeInMainWorld('inmemnote', api);

// Test-only bridge: present only when the app was launched with
// `INMEMNOTE_E2E=1`. Playwright uses it to summon the Draft window without
// firing a real macOS-wide hotkey. The check happens HERE in preload (not in
// main) so the renderer can probe `window.__inmemnote_test__` safely.
if (process.env.INMEMNOTE_E2E === '1') {
  contextBridge.exposeInMainWorld('__inmemnote_test__', {
    showDraft: (): Promise<void> => ipcRenderer.invoke('__test__:showDraft'),
    hideDraft: (): Promise<void> => ipcRenderer.invoke('__test__:hideDraft'),
  });
}
