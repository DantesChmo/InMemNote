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

  // Header / button / resize-handle geometry, mirrored from the renderer.
  // Whenever any of these constants change in CSS, update them here too.
  const HEADER_HEIGHT = 60;
  const PIN_BUTTON_RIGHT_INSET = 20;
  const PIN_BUTTON_WIDTH = 32;
  const RESIZE_HANDLE_SIZE = 18;

  /**
   * True when the global cursor is currently over a region of our window
   * where a mousedown should start an AppKit window-drag — i.e. the
   * header strip EXCLUDING:
   *
   *   - the pin button (Tailwind: `draft-no-drag` in the renderer);
   *   - the resize handle that lives in the corner diagonally opposite
   *     the current pin anchor. This is the critical fix for "pin at
   *     bottom" cases: when the pin is in `bl` or `br`, the handle sits
   *     in the TOP corner of the panel, i.e. INSIDE the drag region, and
   *     the renderer-side `mousedown` arrives later than this native
   *     detector. Excluding the handle's 18×18 square here is the only
   *     reliable way to keep AppKit's drag from starting.
   */
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
    if (overPinButton) return false;
    // Resize handle hit-test. The handle sits on the OPPOSITE corner of
    // the pin anchor; we only need to consider top-row corners here
    // because non-top corners aren't inside the header strip.
    const handleAt = oppositeCorner(lastPinnedCorner);
    if (handleAt === 'tl' && c.x < b.x + RESIZE_HANDLE_SIZE && c.y < b.y + RESIZE_HANDLE_SIZE) {
      return false;
    }
    if (
      handleAt === 'tr' &&
      c.x >= b.x + b.width - RESIZE_HANDLE_SIZE &&
      c.y < b.y + RESIZE_HANDLE_SIZE
    ) {
      return false;
    }
    return true;
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
    // A resize gesture started elsewhere (via `DraftBeginResize`). It owns
    // the cursor stream until mouse-up; the header drag must NOT compete.
    if (resizeState) return;
    if (!cursorOverDragHeader()) return;
    if (dragging) return;
    dragging = true;
    if (!w.isDestroyed()) w.webContents.send('draft:dragStart');
  });

  windowEvents.subscribeToMouseUp(() => {
    // First: end resize if one is in flight. Resize doesn't trigger a
    // drag-snap because the user explicitly set the window to a custom
    // size — the position was anchored to the pin corner all along.
    if (resizeState) {
      resizeState = null;
      // Re-enable AppKit window dragging. We turn it off in `beginResize`
      // so the system doesn't try to follow the cursor with the whole
      // window while we're driving manual `setBounds` calls.
      if (!w.isDestroyed()) w.setMovable(true);
      return;
    }
    if (!dragging) return;
    dragging = false;
    if (w.isDestroyed()) return;
    const b = w.getBounds();
    const display = screen.getDisplayMatching(b);
    const home = cornerBounds(display, lastPinnedCorner, { width: b.width, height: b.height });
    const moved = b.x !== home.x || b.y !== home.y;
    if (moved) {
      snapToCorner(w, cornerForWindow(w), { animate: true });
    } else {
      w.webContents.send('draft:dragEnd');
    }
  });

  // Resize stream. While `resizeState` is non-null, every native
  // mouse-drag callback re-applies the new size relative to the cursor
  // delta and the captured starting bounds. Anchor stays at the pin
  // corner so the corner the user is NOT dragging never moves.
  windowEvents.subscribeToMouseDrag(() => {
    if (!resizeState || !draftWin || draftWin.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const dx = cursor.x - resizeState.startCursor.x;
    const dy = cursor.y - resizeState.startCursor.y;
    // `draggedCorner` is the diagonal opposite of the pin's anchor — the
    // corner whose handle the user is holding. Its sign tells us which
    // direction increases the size.
    const widthSign = resizeState.draggedCorner === 'tl' || resizeState.draggedCorner === 'bl' ? -1 : 1;
    const heightSign = resizeState.draggedCorner === 'tl' || resizeState.draggedCorner === 'tr' ? -1 : 1;
    const display = screen.getDisplayMatching(resizeState.startBounds);
    const raw = {
      width: resizeState.startBounds.width + widthSign * dx,
      height: resizeState.startBounds.height + heightSign * dy,
    };
    const size = clampPinSize(display, raw);
    setCustomPinSize(size);
    const target = cornerBounds(display, lastPinnedCorner, size);
    setBoundsImmediate(w, target);
  });

  // Header hover sensor. Pinned mode only — we filter here rather than
  // installing/removing on every pin toggle so the AppKit subview stays
  // attached for the window's whole lifetime (cheaper, and avoids any
  // mid-pin race where the user is already hovering at the moment of
  // toggle). Forwarded as `draft:headerHover` with a boolean payload.
  windowEvents.installHeaderHoverTracker(
    w.getNativeWindowHandle(),
    HEADER_HEIGHT,
    (hovering: boolean) => {
      if (w.isDestroyed()) return;
      if (!draftPinned) return;
      w.webContents.send(IPC.DraftHeaderHover, hovering);
    },
  );

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
const PIN_DEFAULT_HEIGHT = 220;

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

/**
 * In-flight resize: when the user is dragging the corner handle, main
 * intercepts the AppKit `LeftMouseDragged` stream and rewrites `setBounds`
 * on every event. `null` while idle.
 */
let resizeState: {
  startCursor: { x: number; y: number };
  startBounds: Bounds;
  draggedCorner: Corner;
} | null = null;
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

function oppositeCorner(corner: Corner): Corner {
  switch (corner) {
    case 'tr':
      return 'bl';
    case 'tl':
      return 'br';
    case 'br':
      return 'tl';
    case 'bl':
      return 'tr';
  }
}

/**
 * User-customized pin width/height set via resize handles. `null` means
 * "follow the default": width = PIN_WIDTH, height = content-driven via the
 * renderer's ResizeObserver. Reset by the header's reset button.
 */
let customPinSize: { width: number; height: number } | null = null;

function setCustomPinSize(
  next: { width: number; height: number } | null,
): void {
  const wasActive = customPinSize !== null;
  customPinSize = next;
  const isActive = next !== null;
  if (wasActive !== isActive && draftWin && !draftWin.isDestroyed()) {
    draftWin.webContents.send(IPC.DraftCustomSizeChanged, isActive);
  }
}

/**
 * Max pin dimensions: 90 % of one quarter of the work area along each
 * axis. Caps the resize so the panel can't sprawl across most of the
 * screen — a "pin" is meant to stay small.
 */
function pinSizeLimits(display: Electron.Display): {
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
} {
  const wa = display.workArea;
  return {
    minW: PIN_WIDTH,
    maxW: Math.round(wa.width * 0.45),
    minH: 180,
    maxH: Math.round(wa.height * 0.45),
  };
}

function clampPinSize(
  display: Electron.Display,
  size: { width: number; height: number },
): { width: number; height: number } {
  const { minW, maxW, minH, maxH } = pinSizeLimits(display);
  return {
    width: Math.max(minW, Math.min(Math.round(size.width), maxW)),
    height: Math.max(minH, Math.min(Math.round(size.height), maxH)),
  };
}

function cornerBounds(
  display: Electron.Display,
  corner: Corner,
  size: { width: number; height: number },
): Bounds {
  const wa = display.workArea;
  return {
    x:
      corner === 'tr' || corner === 'br'
        ? wa.x + wa.width - size.width - PIN_INSET
        : wa.x + PIN_INSET,
    y:
      corner === 'bl' || corner === 'br'
        ? wa.y + wa.height - size.height - PIN_INSET
        : wa.y + PIN_INSET,
    width: size.width,
    height: size.height,
  };
}

/**
 * Pin size used by `snapToCorner` callers that don't supply an explicit
 * `targetHeight`. Honors the user's custom size when present, otherwise
 * falls back to the design default width and a sensible default height.
 */
function effectivePinSize(
  w: BrowserWindow,
  targetHeight?: number,
): { width: number; height: number } {
  if (customPinSize) return customPinSize;
  return { width: PIN_WIDTH, height: targetHeight ?? w.getBounds().height ?? 220 };
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
  const size = effectivePinSize(w, opts.targetHeight);
  const target = cornerBounds(display, corner, size);
  if (corner !== lastPinnedCorner) {
    lastPinnedCorner = corner;
    if (!w.isDestroyed()) w.webContents.send('draft:cornerChanged', corner);
  }
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
    // Once the user has manually resized the pinned panel, ResizeObserver
    // updates stop driving the height — the custom size is the authoritative
    // dimension until reset.
    if (draftPinned && customPinSize) return;
    const display = screen.getDisplayMatching(draftWin.getBounds());
    const minH = draftPinned ? 180 : 200;
    const maxH = draftPinned ? 360 : Math.round(display.workArea.height * 0.6);
    const next = Math.max(minH, Math.min(Math.round(rawHeight), maxH));
    const bounds = draftWin.getBounds();
    if (Math.abs(next - bounds.height) < 2) return;
    const [w] = draftWin.getSize();
    const width = w ?? 560;
    draftWin.setBounds({ x: bounds.x, y: bounds.y, width, height: next });
  });

  // Manual resize from the renderer (drag of the corner handle). The
  // renderer ships a target width/height; main clamps to the pin's allowed
  // bracket and recomputes x/y so the anchor (= last pinned corner) stays
  // pixel-pinned. This means the corner the user is NOT dragging never
  // moves — exactly the expectation for "resize from the opposite corner".
  ipcMain.handle(
    IPC.DraftSetPinSize,
    async (_e, raw: { width: number; height: number }): Promise<void> => {
      if (!draftWin) return;
      if (!draftPinned) return;
      if (pinAnimating) return;
      const display = screen.getDisplayMatching(draftWin.getBounds());
      const size = clampPinSize(display, raw);
      setCustomPinSize(size);
      const target = cornerBounds(display, lastPinnedCorner, size);
      const cur = draftWin.getBounds();
      if (
        Math.abs(cur.width - target.width) < 1 &&
        Math.abs(cur.height - target.height) < 1 &&
        Math.abs(cur.x - target.x) < 1 &&
        Math.abs(cur.y - target.y) < 1
      ) {
        return;
      }
      setBoundsImmediate(draftWin, target);
    },
  );

  ipcMain.handle(IPC.DraftGetCorner, async (): Promise<Corner> => lastPinnedCorner);

  ipcMain.handle(IPC.DraftBeginResize, async (): Promise<void> => {
    if (!draftWin || !draftPinned) return;
    if (pinAnimating) return;
    resizeState = {
      startCursor: screen.getCursorScreenPoint(),
      startBounds: draftWin.getBounds(),
      // The user grabbed the corner opposite the pin's anchor.
      draggedCorner: oppositeCorner(lastPinnedCorner),
    };
    // Turn off AppKit's "drag this window around" gesture while we own
    // the cursor stream. Without this, dragging the resize handle near
    // the top of the panel can race AppKit into starting a window move
    // — particularly visible when the pin is in a bottom corner and the
    // resize handle ends up over the header strip.
    draftWin.setMovable(false);
  });

  ipcMain.handle(IPC.DraftResetPinSize, async (): Promise<void> => {
    if (!draftWin) return;
    if (!draftPinned) return;
    setCustomPinSize(null);
    const display = screen.getDisplayMatching(draftWin.getBounds());
    // Animate back to the design-default width AND a default pinned
    // height. The renderer will switch back to its content-fit layout
    // (because `customSizeChanged` just fired with `false`) and the
    // ResizeObserver will tighten the height further to fit the body
    // once the animation settles.
    const target = cornerBounds(display, lastPinnedCorner, {
      width: PIN_WIDTH,
      height: PIN_DEFAULT_HEIGHT,
    });
    animateBounds(draftWin, target);
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
