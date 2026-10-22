import { IPC, type InmemnoteAPI, type InmemnoteTestAPI, type Unsubscribe } from '@shared/ipc';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

/**
 * Preload script.
 *
 * Bridges the renderer (React) with the main process. We expose a narrow,
 * typed API on `window.inmemnote` — no raw `ipcRenderer`, no Node primitives.
 * Anything not listed here is unreachable from the UI; that's the security
 * boundary.
 *
 * The surface itself is the `InmemnoteAPI` contract in `@shared/ipc`
 * (ADR 0005) — per-method docs live there. This file only maps each method
 * onto its channel.
 */

/**
 * Subscribe `handler` to a main → renderer push, dropping the Electron event
 * argument. Returns the unsubscribe the renderer calls in `useEffect`
 * cleanup to avoid stacked listeners on hot-reload.
 */
function subscribe<A extends unknown[]>(
  channel: string,
  handler: (...args: A) => void,
): Unsubscribe {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => handler(...(args as A));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: InmemnoteAPI = {
  draft: {
    open: () => ipcRenderer.invoke(IPC.DraftOpen),
    save: (id, content) => ipcRenderer.invoke(IPC.DraftSave, id, content),
    close: (id) => ipcRenderer.invoke(IPC.DraftClose, id),
    togglePin: (id, targetHeight) => ipcRenderer.invoke(IPC.DraftTogglePin, id, targetHeight),
    hide: () => ipcRenderer.invoke(IPC.DraftHide),
    resize: (height) => ipcRenderer.invoke(IPC.DraftResize, height),
    promote: (id) => ipcRenderer.invoke(IPC.DraftPromote, id),
    onHotkey: (handler) => subscribe(IPC.DraftHotkey, handler),
    onAnimationDone: (handler) => subscribe(IPC.DraftAnimationDone, handler),
    onAnimationStart: (handler) => subscribe(IPC.DraftAnimationStart, handler),
    onDragStart: (handler) => subscribe(IPC.DraftDragStart, handler),
    onDragEnd: (handler) => subscribe(IPC.DraftDragEnd, handler),
    setPinSize: (size) => ipcRenderer.invoke(IPC.DraftSetPinSize, size),
    resetPinSize: () => ipcRenderer.invoke(IPC.DraftResetPinSize),
    getCorner: () => ipcRenderer.invoke(IPC.DraftGetCorner),
    onCustomSizeChanged: (handler) => subscribe(IPC.DraftCustomSizeChanged, handler),
    beginResize: () => ipcRenderer.invoke(IPC.DraftBeginResize),
    onCornerChanged: (handler) => subscribe(IPC.DraftCornerChanged, handler),
    onHeaderHover: (handler) => subscribe(IPC.DraftHeaderHover, handler),
  },
  notes: {
    list: (filter) => ipcRenderer.invoke(IPC.NotesList, filter),
    get: (id) => ipcRenderer.invoke(IPC.NotesGet, id),
    create: () => ipcRenderer.invoke(IPC.NotesCreate),
    save: (id, content) => ipcRenderer.invoke(IPC.NotesSave, id, content),
    togglePin: (id) => ipcRenderer.invoke(IPC.NotesTogglePin, id),
    delete: (id) => ipcRenderer.invoke(IPC.NotesDelete, id),
    search: (query) => ipcRenderer.invoke(IPC.NotesSearch, query),
    onChanged: (handler) => subscribe(IPC.NotesChanged, handler),
  },
  settings: {
    load: () => ipcRenderer.invoke(IPC.SettingsLoad),
    save: (patch) => ipcRenderer.invoke(IPC.SettingsSave, patch),
    onChanged: (handler) => subscribe(IPC.SettingsChanged, handler),
  },
  update: {
    check: () => ipcRenderer.invoke(IPC.UpdateCheck),
    install: () => ipcRenderer.invoke(IPC.UpdateInstall),
    onAvailable: (handler) => subscribe(IPC.UpdateAvailable, handler),
    onProgress: (handler) => subscribe(IPC.UpdateProgress, handler),
  },
};

contextBridge.exposeInMainWorld('inmemnote', api);

// Test-only bridge: present only when the app was launched with
// `INMEMNOTE_E2E=1`. Playwright uses it to summon the Draft window without
// firing a real macOS-wide hotkey. The check happens HERE in preload (not in
// main) so the renderer can probe `window.__inmemnote_test__` safely.
if (process.env.INMEMNOTE_E2E === '1') {
  const testApi: InmemnoteTestAPI = {
    showDraft: () => ipcRenderer.invoke(IPC.TestShowDraft),
    hideDraft: () => ipcRenderer.invoke(IPC.TestHideDraft),
  };
  contextBridge.exposeInMainWorld('__inmemnote_test__', testApi);
}
