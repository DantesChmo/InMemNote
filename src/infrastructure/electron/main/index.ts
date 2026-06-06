import { join } from 'node:path';

import { CloseDraftUseCase } from '@application/draft/CloseDraftUseCase';
import { OpenDraftUseCase } from '@application/draft/OpenDraftUseCase';
import { SaveDraftUseCase } from '@application/draft/SaveDraftUseCase';
import { TogglePinUseCase } from '@application/draft/TogglePinUseCase';
import { CreateNoteUseCase } from '@application/note/CreateNoteUseCase';
import { DeleteNoteUseCase } from '@application/note/DeleteNoteUseCase';
import { FindNoteUseCase } from '@application/note/FindNoteUseCase';
import { ListNotesUseCase } from '@application/note/ListNotesUseCase';
import { PromoteDraftToNoteUseCase } from '@application/note/PromoteDraftToNoteUseCase';
import { SearchNotesUseCase } from '@application/note/SearchNotesUseCase';
import { ToggleNotePinUseCase } from '@application/note/ToggleNotePinUseCase';
import { UpdateNoteContentUseCase } from '@application/note/UpdateNoteContentUseCase';
import { DraftId } from '@domain/draft/DraftId';
import { NoteId } from '@domain/note/NoteId';
import { loadHotkeys } from '@infrastructure/config/HotkeysConfig';
import {
  IPC,
  type DraftDTO,
  type NoteDTO,
  type NoteListFilterDTO,
} from '@infrastructure/electron/ipc-channels';
import { InMemoryDraftRepository } from '@infrastructure/persistence/InMemoryDraftRepository';
import { InMemoryNoteRepository } from '@infrastructure/persistence/InMemoryNoteRepository';
import { SqliteDraftRepository } from '@infrastructure/persistence/sqlite/SqliteDraftRepository';
import { SqliteNoteRepository } from '@infrastructure/persistence/sqlite/SqliteNoteRepository';
import { SystemClock } from '@infrastructure/SystemClock';
import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';

import type { DraftNote } from '@domain/draft/DraftNote';
import type { DraftRepository } from '@domain/draft/DraftRepository';
import type { Note } from '@domain/note/Note';
import type { NoteListFilter, NoteRepository } from '@domain/note/NoteRepository';

/**
 * Electron main process entry point.
 *
 * Two windows:
 *   - **Library** — the main application window. Visible Dock icon, opens at
 *     startup, has a normal title bar. Created lazily so a global-hotkey-only
 *     workflow (the user never opens Library) doesn't pay the cost.
 *   - **Draft** — a frameless overlay summoned by the global hotkey. Hides on
 *     blur unless pinned.
 *
 * Both windows live in the same renderer bundle, routed by `?view=` in the URL.
 */

// Vite-injected constants for the bundled renderer's entrypoint.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let draftWin: BrowserWindow | null = null;
let libraryWin: BrowserWindow | null = null;

const clock = new SystemClock();

// ---------- Test-mode hooks ----------
//
// These are inert in production builds: they only activate when the binary is
// launched with `INMEMNOTE_E2E=1`. We isolate them here so the test affordances
// are obvious and easy to audit (no scattered `if (env)` checks across the code).
//
// 1. `INMEMNOTE_USER_DATA` redirects the userData directory to a fresh tmp
//    folder per E2E run, giving each test a clean SQLite file.
// 2. `INMEMNOTE_E2E=1` enables the `__test__:showDraft` IPC channel that
//    Playwright uses to summon the Draft overlay without firing a real
//    system-wide hotkey (Playwright cannot dispatch those).
const E2E_MODE = process.env.INMEMNOTE_E2E === '1';
if (process.env.INMEMNOTE_USER_DATA) {
  // `setPath('userData', ...)` MUST run before any `app.getPath('userData')`
  // call — Electron caches the resolved value on first access.
  app.setPath('userData', process.env.INMEMNOTE_USER_DATA);
}

// ---------- Repository wiring (composition root) ----------

function buildDraftRepo(): DraftRepository {
  try {
    return new SqliteDraftRepository(join(app.getPath('userData'), 'inmemnote.db'));
  } catch (e) {
    console.warn('SQLite (drafts) init failed; falling back to in-memory.', e);
    return new InMemoryDraftRepository();
  }
}

function buildNoteRepo(): NoteRepository {
  try {
    return new SqliteNoteRepository(join(app.getPath('userData'), 'inmemnote.db'));
  } catch (e) {
    console.warn('SQLite (notes) init failed; falling back to in-memory.', e);
    return new InMemoryNoteRepository();
  }
}

// ---------- DTO mappers ----------

function draftToDTO(d: DraftNote): DraftDTO {
  return {
    id: d.id,
    content: d.content.value,
    pinned: d.pinned,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function noteToDTO(n: Note): NoteDTO {
  return {
    id: n.id,
    content: n.content.value,
    title: n.title(),
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

// ---------- Renderer loading ----------

/**
 * Tell a BrowserWindow to load the renderer for a particular view.
 *
 * Dev: Vite serves the bundle via HTTP, so we append `?view=` to the URL.
 *
 * Prod: we use `loadFile(..., { query })` instead of `loadURL('file://...?q=')`.
 * Electron's `file://` parser drops the query string in some versions, which
 * means our `App.tsx` reads an empty `?view=` and defaults to Library — that
 * silently broke the Draft window's renderer.
 */
function loadRenderer(w: BrowserWindow, view: 'draft' | 'library'): void {
  // Diagnostic plumbing: surface renderer-side console + load failures into the
  // main process stdout. Without this, a blank window after `loadFile` looks
  // identical to a successful load.
  w.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`[renderer:${view}][${level}] ${source}:${line} ${message}`);
  });
  w.webContents.on('did-fail-load', (_e, errCode, errDesc, url) => {
    console.error(`[renderer:${view}] did-fail-load ${errCode} ${errDesc} url=${url}`);
  });
  w.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[renderer:${view}] render-process-gone`, details);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void w.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?view=${view}`);
    return;
  }
  const indexPath = join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
  void w.loadFile(indexPath, { query: { view } });
}

// ---------- Draft window ----------

function createDraftWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 560,
    height: 220,
    // `frame: false` alone hides the title bar AND the macOS traffic lights.
    // Earlier we also passed `titleBarStyle: 'hidden'` — on macOS that style
    // implicitly re-introduces the stop-light buttons, which is wrong for a
    // Spotlight-style overlay. Plain `frame: false` is the right call here.
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    show: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    fullscreenable: false,
    // Excluded from the macOS window switcher (⌘`) and Mission Control —
    // matches how Spotlight behaves.
    hiddenInMissionControl: true,
    vibrancy: 'under-window',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  loadRenderer(w, 'draft');

  // Hide on blur unless pinned — pinned drafts should stay put.
  w.on('blur', () => {
    if (w.isVisible() && !w.isAlwaysOnTop()) w.hide();
  });

  return w;
}

// The two layout modes are spec'd in design/Inmemnote - Draft (hi-fi).html.
// Width is fixed per mode (560 unpinned, 320 pinned). Height starts from the
// default and then gets nudged by the renderer's ResizeObserver.
const DRAFT_DEFAULT_WIDTH = 560;
const PIN_WIDTH = 320;
const PIN_INSET = 24;

function centerOnCursorDisplay(w: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const height = w.getBounds().height || 220;
  w.setBounds({
    x: Math.round(
      display.workArea.x + (display.workArea.width - DRAFT_DEFAULT_WIDTH) / 2,
    ),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    width: DRAFT_DEFAULT_WIDTH,
    height,
  });
}

function snapToTopRight(w: BrowserWindow): void {
  const display = screen.getDisplayMatching(w.getBounds());
  // Pinned mode also caps the body height to the spec's max of 180; we leave a
  // little extra (~40px) for the header.
  const height = Math.min(w.getBounds().height || 220, 220);
  w.setBounds({
    x: display.workArea.x + display.workArea.width - PIN_WIDTH - PIN_INSET,
    y: display.workArea.y + PIN_INSET,
    width: PIN_WIDTH,
    height,
  });
}

function toggleDraftWindow(): void {
  if (!draftWin) return;
  if (draftWin.isVisible()) {
    draftWin.hide();
    return;
  }
  centerOnCursorDisplay(draftWin);
  draftWin.show();
  draftWin.focus();
  draftWin.webContents.send('draft:hotkey');
}

// ---------- Library window ----------

function createLibraryWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    title: 'Inmemnote',
    titleBarStyle: 'hiddenInset', // keeps native traffic lights but hides the bar
    backgroundColor: '#1c1b18',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  loadRenderer(w, 'library');
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => {
    libraryWin = null;
  });
  return w;
}

function openOrFocusLibrary(): void {
  if (libraryWin && !libraryWin.isDestroyed()) {
    if (libraryWin.isMinimized()) libraryWin.restore();
    libraryWin.focus();
    return;
  }
  libraryWin = createLibraryWindow();
}

/** Broadcast "the library changed" to every open window. */
function emitNotesChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(IPC.NotesChanged);
  }
}

// ---------- App lifecycle ----------

app.whenReady().then(() => {
  const drafts = buildDraftRepo();
  const notes = buildNoteRepo();

  const openDraftUC = new OpenDraftUseCase(drafts, clock);
  const saveDraftUC = new SaveDraftUseCase(drafts, clock);
  const closeDraftUC = new CloseDraftUseCase(drafts);
  const togglePinDraftUC = new TogglePinUseCase(drafts, clock);
  const promoteUC = new PromoteDraftToNoteUseCase(drafts, notes, clock);

  const listNotesUC = new ListNotesUseCase(notes);
  const findNoteUC = new FindNoteUseCase(notes);
  const createNoteUC = new CreateNoteUseCase(notes, clock);
  const updateNoteUC = new UpdateNoteContentUseCase(notes, clock);
  const togglePinNoteUC = new ToggleNotePinUseCase(notes, clock);
  const deleteNoteUC = new DeleteNoteUseCase(notes);
  const searchNotesUC = new SearchNotesUseCase(notes);

  draftWin = createDraftWindow();
  openOrFocusLibrary();

  // ---------- Draft IPC ----------
  ipcMain.handle(IPC.DraftOpen, async (): Promise<DraftDTO> => {
    const note = await openDraftUC.execute();
    await drafts.save(note);
    return draftToDTO(note);
  });

  ipcMain.handle(IPC.DraftSave, async (_e, id: string, content: string): Promise<DraftDTO> => {
    const idResult = DraftId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await saveDraftUC.execute(idResult.value, content);
    if (!r.ok) throw new Error(r.error.message);
    return draftToDTO(r.value);
  });

  ipcMain.handle(IPC.DraftClose, async (_e, id: string): Promise<void> => {
    const idResult = DraftId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    await closeDraftUC.execute(idResult.value);
  });

  ipcMain.handle(IPC.DraftTogglePin, async (_e, id: string): Promise<DraftDTO> => {
    const idResult = DraftId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await togglePinDraftUC.execute(idResult.value);
    if (!r.ok) throw new Error(r.error.message);
    if (draftWin) {
      draftWin.setAlwaysOnTop(r.value.pinned, 'floating');
      draftWin.setVisibleOnAllWorkspaces(r.value.pinned, { visibleOnFullScreen: true });
      if (r.value.pinned) snapToTopRight(draftWin);
      else centerOnCursorDisplay(draftWin);
    }
    return draftToDTO(r.value);
  });

  ipcMain.handle(IPC.DraftHide, async (): Promise<void> => {
    if (draftWin && draftWin.isVisible() && !draftWin.isAlwaysOnTop()) draftWin.hide();
  });

  ipcMain.handle(IPC.DraftResize, async (_e, rawHeight: number): Promise<void> => {
    if (!draftWin) return;
    const display = screen.getDisplayMatching(draftWin.getBounds());
    const maxH = Math.round(display.workArea.height * 0.6);
    const next = Math.max(96, Math.min(Math.round(rawHeight), maxH));
    const [w] = draftWin.getSize();
    const width = w ?? 560;
    const bounds = draftWin.getBounds();
    draftWin.setBounds({ x: bounds.x, y: bounds.y, width, height: next });
  });

  ipcMain.handle(IPC.DraftPromote, async (_e, id: string): Promise<NoteDTO | null> => {
    const idResult = DraftId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await promoteUC.execute(idResult.value);
    if (!r.ok) throw new Error(r.error.message);
    if (r.value) emitNotesChanged();
    return r.value ? noteToDTO(r.value) : null;
  });

  // ---------- Notes IPC ----------
  ipcMain.handle(IPC.NotesList, async (_e, filter: NoteListFilterDTO): Promise<NoteDTO[]> => {
    const list = await listNotesUC.execute(filter as NoteListFilter);
    return list.map(noteToDTO);
  });

  ipcMain.handle(IPC.NotesGet, async (_e, id: string): Promise<NoteDTO | null> => {
    const idResult = NoteId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const found = await findNoteUC.execute(idResult.value);
    return found ? noteToDTO(found) : null;
  });

  ipcMain.handle(IPC.NotesCreate, async (): Promise<NoteDTO> => {
    const created = await createNoteUC.execute();
    emitNotesChanged();
    return noteToDTO(created);
  });

  ipcMain.handle(IPC.NotesSave, async (_e, id: string, content: string): Promise<NoteDTO> => {
    const idResult = NoteId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await updateNoteUC.execute(idResult.value, content);
    if (!r.ok) throw new Error(r.error.message);
    emitNotesChanged();
    return noteToDTO(r.value);
  });

  ipcMain.handle(IPC.NotesTogglePin, async (_e, id: string): Promise<NoteDTO> => {
    const idResult = NoteId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await togglePinNoteUC.execute(idResult.value);
    if (!r.ok) throw new Error(r.error.message);
    emitNotesChanged();
    return noteToDTO(r.value);
  });

  ipcMain.handle(IPC.NotesDelete, async (_e, id: string): Promise<void> => {
    const idResult = NoteId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    await deleteNoteUC.execute(idResult.value);
    emitNotesChanged();
  });

  ipcMain.handle(IPC.NotesSearch, async (_e, query: string): Promise<NoteDTO[]> => {
    const list = await searchNotesUC.execute(query);
    return list.map(noteToDTO);
  });

  // ---------- Global hotkey ----------
  const { hotkeys, warning } = loadHotkeys({
    defaultsPath: join(app.getAppPath(), 'config/hotkeys.json'),
    userOverridePath: join(app.getPath('userData'), 'hotkeys.json'),
  });
  if (warning) console.warn(warning);

  const ok = globalShortcut.register(hotkeys.openDraft, toggleDraftWindow);
  if (!ok) {
    console.warn(`Could not register hotkey ${hotkeys.openDraft} — likely already taken.`);
  }

  // ---------- E2E-only affordances ----------
  if (E2E_MODE) {
    ipcMain.handle('__test__:showDraft', async (): Promise<void> => {
      toggleDraftWindow();
    });
    ipcMain.handle('__test__:hideDraft', async (): Promise<void> => {
      if (draftWin && draftWin.isVisible()) draftWin.hide();
    });
    // Playwright's `app.evaluate` runs inside the main process and can read
    // globals directly. Exposing the window toggle here lets E2E helpers
    // summon the overlay without poking at private `ipcMain` internals.
    (
      globalThis as {
        __inmemnoteTest?: { showDraft: () => void; hideDraft: () => void };
      }
    ).__inmemnoteTest = {
      showDraft: () => toggleDraftWindow(),
      hideDraft: () => {
        if (draftWin && draftWin.isVisible()) draftWin.hide();
      },
    };
  }
});

app.on('activate', () => {
  // macOS: clicking the Dock icon when no windows are open should resurface
  // the Library — this is the documented platform convention.
  openOrFocusLibrary();
});

app.on('window-all-closed', () => {
  // Stay alive on macOS so the global hotkey keeps working even after the
  // user closes the Library window. On other platforms (we ship macOS only,
  // but be defensive) quit when no windows remain.
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
