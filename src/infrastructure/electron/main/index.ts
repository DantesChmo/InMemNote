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
import * as windowEvents from '@inmemnote/window-events';
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
// Whether the Draft window is currently in pinned (compact) mode. Main needs
// to know this to apply the right `setBounds` height clamp on every
// `draft:resize` IPC — pinned mode caps at the compact sticky size, while
// the full mode allows the panel to grow up to 60 % of the display.
let draftPinned = false;
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
    // Un-pinned overlay must behave like Spotlight / Raycast: fixed at the
    // cursor display's center, not draggable. We start with `movable: false`
    // and toggle it on whenever the user pins the panel (see
    // `IPC.DraftTogglePin`).
    movable: false,
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

  // macOS `NSWindowSharingNone` via Electron's content-protection bridge.
  // The overlay stays fully visible to the local user but is omitted from
  // every screen-capture API (ScreenCaptureKit, CGWindowList, AVFoundation),
  // so Zoom / Meet / QuickTime viewers don't see whatever the user is
  // capturing in their scratch buffer. We enable this unconditionally for
  // the Draft window — the buffer can hold sensitive text in BOTH pinned
  // and un-pinned states, and the cost is one constructor-time call.
  w.setContentProtection(true);

  loadRenderer(w, 'draft');

  // Hide on blur unless pinned — pinned drafts should stay put.
  w.on('blur', () => {
    if (w.isVisible() && !w.isAlwaysOnTop()) w.hide();
  });

  // --- Drag detection (pinned mode only) ---
  //
  // The frameless window has `-webkit-app-region: drag` on its header in
  // pinned mode, so AppKit owns the actual window move. We track two
  // signals around it:
  //
  //   • "user is currently dragging": the `move` event fires for every
  //     frame of the AppKit move. A real drag never changes the window's
  //     size, only its x/y — programmatic resizes/animations always touch
  //     the size, so the size-equality check filters them out cleanly
  //     without needing a timing heuristic.
  //
  //   • "user released the button": delivered by the AppKit native addon
  //     `@inmemnote/window-events`, which installs an `NSEvent` global +
  //     local monitor for `NSEventMaskLeftMouseUp`. That catches the
  //     release instantly — including releases over other apps that
  //     BrowserWindow never sees — so the snap animation starts on the
  //     same run-loop tick as the actual button release, no debounce, no
  //     idle timer.
  //
  // Why main owns the "drag started" signal: AppKit fully swallows
  // `mousedown` over a `-webkit-app-region: drag` element, so the renderer
  // never sees the event — neither a React handler nor a document-level
  // capture-phase listener fires. The earliest reliable thing we DO get is
  // AppKit's first `move` callback, which arrives the same tick the drag
  // actually begins. We broadcast `draft:dragStart` from there.
  let dragging = false;

  // Header geometry. The drag region matches the panel header, which is 60
  // px tall (see `DraftHeader.tsx`). The pin button sits in the right
  // 20–52 px strip and uses `draft-no-drag`, so a press there must NOT
  // trigger the drag overlay — otherwise clicking pin to toggle it would
  // briefly flash the blur.
  const HEADER_HEIGHT = 60;
  const PIN_BUTTON_RIGHT_INSET = 20;
  const PIN_BUTTON_WIDTH = 32;

  const cursorOverDragHeader = (): boolean => {
    if (w.isDestroyed()) return false;
    const b = w.getBounds();
    const c = screen.getCursorScreenPoint();
    const inWindow = c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height;
    if (!inWindow) return false;
    const inHeader = c.y < b.y + HEADER_HEIGHT;
    if (!inHeader) return false;
    const pinX1 = b.x + b.width - PIN_BUTTON_RIGHT_INSET - PIN_BUTTON_WIDTH;
    const overPinButton = c.x >= pinX1;
    return !overPinButton;
  };

  // The native addon delivers a synchronous mousedown callback for every
  // left-button press anywhere on the system (1–2 ms after the event).
  // We use it to flip the drag overlay ON the instant the user grabs the
  // header — no need to wait for AppKit's first `move` event. The same
  // path was infeasible from the renderer because `-webkit-app-region: drag`
  // makes AppKit consume DOM `mousedown` before any listener can see it.
  // Watch every `move`/`resize` callback while an animation is in flight;
  // emit `animationDone` the moment the window reaches the target pixel
  // coordinates. This is what unblocks the drag overlay to fade out at the
  // exact frame the snap lands, instead of a fixed ~280 ms timer later.
  w.on('move', () => {
    maybeFinishAnimation(w);
  });
  w.on('resize', () => {
    maybeFinishAnimation(w);
  });

  windowEvents.subscribeToMouseDown(() => {
    if (!draftPinned) return;
    if (pinAnimating) return;
    if (!cursorOverDragHeader()) return;
    if (dragging) return;
    dragging = true;
    if (!w.isDestroyed()) w.webContents.send('draft:dragStart');
  });

  windowEvents.subscribeToMouseUp(() => {
    if (!dragging) return;
    dragging = false;
    if (w.isDestroyed()) return;
    // Decide whether the user actually carried the window somewhere new.
    // A click-without-drag (press on the title that isn't followed by
    // motion) leaves the window in its current resting corner — there's
    // no snap to do, so we drop the blur overlay immediately.
    const b = w.getBounds();
    const display = screen.getDisplayMatching(b);
    const home = cornerBounds(display, lastPinnedCorner, b.height);
    const moved = b.x !== home.x || b.y !== home.y;
    if (moved) {
      // Hold the overlay through the snap animation — the renderer drops
      // it when `draft:animationDone` lands at the resting corner. This
      // matches the user's mental model: blur stays on while the window
      // is still in motion, regardless of whether the motion is the
      // user's hand or our easing curve completing it.
      snapToCorner(w, cornerForWindow(w), { animate: true });
    } else {
      w.webContents.send('draft:dragEnd');
    }
  });

  // Tear down the AppKit observers when the window goes away — otherwise
  // the addon would hold a JS callback alive past the window's lifetime.
  w.on('closed', () => {
    windowEvents.unsubscribe();
  });

  return w;
}

// The two layout modes are spec'd in design/Inmemnote - Draft (hi-fi).html.
// Width is fixed per mode (560 unpinned, 320 pinned). Height is content-driven
// — the renderer's ResizeObserver pushes it via the `draft:resize` IPC after
// any layout transition has settled.
const DRAFT_DEFAULT_WIDTH = 560;
const PIN_WIDTH = 320;
const PIN_INSET = 24;

// AppKit's animated `setFrame:animate:` is driven by the same WindowServer
// pipeline that draws every other macOS window, so it lands on the display's
// native refresh rate (60 Hz on most panels, ProMotion when supported).
// Built-in curve is a smooth ease-out — exactly the "iOS-feel" we want.
//
// We previously hand-rolled a JS 60 Hz loop calling `setBounds(_, false)`
// every 16 ms, but on a frameless + transparent window each call costs an
// expensive compositor pass: the effective frame rate degraded to ~30 fps
// and the motion looked choppy. Pushing the work to AppKit gives us actual
// 60 fps for free.
//
// Safety net: AppKit's default NSAnimation runs ~250 ms. If we never see
// the window arrive at the target — e.g. because of pixel-rounding mismatch
// between the bounds we asked for and what AppKit actually committed —
// release the animation lock anyway after this duration.
const PIN_ANIM_FALLBACK_MS = 400;

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

let pinAnimating = false;
let pinAnimationFallback: NodeJS.Timeout | null = null;
// Target the current pin/unpin animation is interpolating toward. We watch
// `move`/`resize` events and emit `animationDone` the moment AppKit settles
// the window onto these exact pixel coordinates — that's the true "the
// animation has finished" signal, not the constant duration we used to
// hard-code. Without this, the drag overlay would visibly linger past the
// real landing for ~30 ms.
let pinAnimationTarget: Bounds | null = null;

function setBoundsImmediate(w: BrowserWindow, target: Bounds): void {
  w.setBounds(target, false);
}

function finishAnimation(w: BrowserWindow): void {
  if (!pinAnimating) return;
  pinAnimating = false;
  pinAnimationTarget = null;
  if (pinAnimationFallback) {
    clearTimeout(pinAnimationFallback);
    pinAnimationFallback = null;
  }
  if (!w.isDestroyed()) w.webContents.send('draft:animationDone');
}

/**
 * Animate the window to `target` using AppKit's native curve.
 *
 * Strictly used for pin/unpin transitions — first-paint summon takes the
 * `setBoundsImmediate` path so the overlay doesn't "fly in" from its
 * previous position when the user hits the global hotkey.
 */
function animateBounds(w: BrowserWindow, target: Bounds): void {
  if (pinAnimationFallback) {
    clearTimeout(pinAnimationFallback);
    pinAnimationFallback = null;
  }
  const start = w.getBounds();
  if (
    start.x === target.x &&
    start.y === target.y &&
    start.width === target.width &&
    start.height === target.height
  ) {
    w.webContents.send('draft:animationDone');
    return;
  }

  pinAnimating = true;
  pinAnimationTarget = target;
  // Tell the renderer to mute its ResizeObserver — otherwise every
  // intermediate frame AppKit produces would round-trip an IPC resize
  // request that competes with the running native animation.
  w.webContents.send('draft:animationStart');
  w.setBounds(target, true);

  // Fallback only — primary completion path is the bounds-equality check
  // in the `move`/`resize` handlers below.
  pinAnimationFallback = setTimeout(() => finishAnimation(w), PIN_ANIM_FALLBACK_MS);
}

/**
 * Called on every AppKit `move` / `resize` callback while an animation
 * is in flight. If the window has reached the target pixel coordinates,
 * settle the animation immediately — no waiting for a timer.
 */
function maybeFinishAnimation(w: BrowserWindow): void {
  if (!pinAnimating || !pinAnimationTarget) return;
  const b = w.getBounds();
  const t = pinAnimationTarget;
  if (b.x === t.x && b.y === t.y && b.width === t.width && b.height === t.height) {
    finishAnimation(w);
  }
}

interface LayoutOpts {
  /** When `true`, the move/resize is animated. */
  animate: boolean;
  /**
   * Final window height, in CSS px, that the renderer has predicted from
   * the post-toggle layout. We honor it as the exact animation target so
   * the window only animates ONCE — without it, main would animate to a
   * guessed value and then immediately re-snap to the real content height,
   * which the user sees as a two-step jump.
   *
   * Falls back to the window's current height when the renderer doesn't
   * supply one (e.g. test harness, very old renderer build).
   */
  targetHeight?: number;
}

function centerOnCursorDisplay(w: BrowserWindow, opts: LayoutOpts): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const height = opts.targetHeight ?? w.getBounds().height ?? 220;
  const target: Bounds = {
    x: Math.round(display.workArea.x + (display.workArea.width - DRAFT_DEFAULT_WIDTH) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    width: DRAFT_DEFAULT_WIDTH,
    height,
  };
  if (opts.animate) animateBounds(w, target);
  else setBoundsImmediate(w, target);
}

/**
 * The four corner slots the pinned overlay can occupy. We track the last
 * one the user chose so that repinning brings the panel back to where they
 * left it, not always to the design-default top-right.
 */
type Corner = 'tl' | 'tr' | 'bl' | 'br';
let lastPinnedCorner: Corner = 'tr';

function cornerBounds(
  display: Electron.Display,
  corner: Corner,
  height: number,
): Bounds {
  const wa = display.workArea;
  return {
    x:
      corner === 'tr' || corner === 'br'
        ? wa.x + wa.width - PIN_WIDTH - PIN_INSET
        : wa.x + PIN_INSET,
    y:
      corner === 'bl' || corner === 'br'
        ? wa.y + wa.height - height - PIN_INSET
        : wa.y + PIN_INSET,
    width: PIN_WIDTH,
    height,
  };
}

/**
 * Park the window in `corner` of the current display.
 *
 * Used both for the initial pin transition (with the corner the user last
 * picked) and for the drag-and-snap flow (with the corner the user just
 * dropped the window into).
 */
function snapToCorner(w: BrowserWindow, corner: Corner, opts: LayoutOpts): void {
  const display = screen.getDisplayMatching(w.getBounds());
  const height = opts.targetHeight ?? w.getBounds().height ?? 220;
  const target = cornerBounds(display, corner, height);
  lastPinnedCorner = corner;
  if (opts.animate) animateBounds(w, target);
  else setBoundsImmediate(w, target);
}

/**
 * Decide which corner the window center is closest to. Splits the display
 * work area into 4 quadrants of the same size; the corner whose quadrant
 * contains the window center wins.
 */
function cornerForWindow(w: BrowserWindow): Corner {
  const display = screen.getDisplayMatching(w.getBounds());
  const b = w.getBounds();
  const centerX = b.x + b.width / 2;
  const centerY = b.y + b.height / 2;
  const dispMidX = display.workArea.x + display.workArea.width / 2;
  const dispMidY = display.workArea.y + display.workArea.height / 2;
  const right = centerX >= dispMidX;
  const bottom = centerY >= dispMidY;
  if (right && bottom) return 'br';
  if (right && !bottom) return 'tr';
  if (!right && bottom) return 'bl';
  return 'tl';
}

function toggleDraftWindow(): void {
  if (!draftWin) return;
  if (draftWin.isVisible()) {
    draftWin.hide();
    return;
  }
  // Summon: the window appears at the cursor's display center. No animation
  // — the user hit a hotkey, not a UI control, and a "fly-in" effect would
  // feel wrong (Spotlight doesn't animate either).
  centerOnCursorDisplay(draftWin, { animate: false });
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

  ipcMain.handle(
    IPC.DraftTogglePin,
    async (_e, id: string, targetHeight?: number): Promise<DraftDTO> => {
      const idResult = DraftId.create(id);
      if (!idResult.ok) throw new Error(idResult.error.message);
      const r = await togglePinDraftUC.execute(idResult.value);
      if (!r.ok) throw new Error(r.error.message);
      draftPinned = r.value.pinned;
      if (draftWin) {
        draftWin.setAlwaysOnTop(r.value.pinned, 'floating');
        draftWin.setVisibleOnAllWorkspaces(r.value.pinned, { visibleOnFullScreen: true });
        // Pinned overlay can be dragged between corners; un-pinned is
        // immovable (Spotlight-style). `setMovable` works in tandem with
        // the `draft-drag` CSS class on the header: both have to allow the
        // move for AppKit to actually translate the window.
        draftWin.setMovable(r.value.pinned);
        if (r.value.pinned) snapToCorner(draftWin, lastPinnedCorner, { animate: true, targetHeight });
        else centerOnCursorDisplay(draftWin, { animate: true, targetHeight });
      }
      return draftToDTO(r.value);
    },
  );

  ipcMain.handle(IPC.DraftHide, async (): Promise<void> => {
    if (draftWin && draftWin.isVisible() && !draftWin.isAlwaysOnTop()) draftWin.hide();
  });

  ipcMain.handle(IPC.DraftResize, async (_e, rawHeight: number): Promise<void> => {
    if (!draftWin) return;
    // Skip while a pin/unpin animation is owning setBounds — otherwise each
    // intermediate AppKit frame would race with a renderer-driven height
    // update and you'd see the window twitch.
    if (pinAnimating) return;
    const display = screen.getDisplayMatching(draftWin.getBounds());
    // Per-mode height bracket. Pinned mode caps at a compact sticky size; the
    // full mode allows the panel to grow up to 60 % of the work area. The
    // renderer-side body has its own matching `max-height`, so once the
    // window hits the cap, content stays inside the body's scrollable area.
    // Mins/maxes account for the chrome that's always present (header 60,
    // divider 1, footer 46 — kept in both pinned and full modes to avoid
    // the structural jump described above).
    const minH = draftPinned ? 180 : 200;
    const maxH = draftPinned ? 360 : Math.round(display.workArea.height * 0.6);
    const next = Math.max(minH, Math.min(Math.round(rawHeight), maxH));
    const bounds = draftWin.getBounds();
    // No-op if we're already there. Without this, every `setBounds` call
    // triggers a renderer reflow that fires the ResizeObserver, which then
    // posts another `draft:resize` — an infinite ping-pong even with no
    // user input. A 2 px deadband absorbs sub-pixel oscillations.
    if (Math.abs(next - bounds.height) < 2) return;
    const [w] = draftWin.getSize();
    const width = w ?? 560;
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
    defaultsPath: join(app.getAppPath(), 'config/hotkeys.yaml'),
    userOverridePath: join(app.getPath('userData'), 'hotkeys.yaml'),
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
