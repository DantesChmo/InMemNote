import { join } from 'node:path';

import { IPC } from '@infrastructure/electron/ipc-channels';
import * as windowEvents from '@inmemnote/window-events';
import { BrowserWindow, screen } from 'electron';

import { loadRenderer } from '../renderer';

import {
  clampPinSize,
  cornerBounds,
  cornerForBounds,
  DRAFT_DEFAULT_WIDTH,
  HEADER_HEIGHT,
  oppositeCorner,
  PIN_BUTTON_RIGHT_INSET,
  PIN_BUTTON_WIDTH,
  PIN_DEFAULT_HEIGHT,
  PIN_WIDTH,
  RESIZE_HANDLE_SIZE,
} from './draft-geometry';

import type { Bounds, Corner, LayoutOpts } from './draft-types';

/**
 * Owns the Draft window — a frameless overlay summoned by the global
 * hotkey, the macOS counterpart to Spotlight / Raycast.
 *
 * Responsibilities encapsulated here (previously scattered across `main`):
 *   - Window factory + BrowserWindow lifecycle.
 *   - The two visual modes: centered-on-cursor-display (unpinned) and
 *     pinned-to-a-corner (with user-customizable size).
 *   - Pin/unpin animation, including the "settle the moment AppKit reports
 *     the target bounds" fast-path with a timer fallback.
 *   - Native drag detection on the header (subscribed to AppKit mouse
 *     events via the `@inmemnote/window-events` addon).
 *   - Native resize from the corner handle, with the anchor corner pinned.
 *   - Header hover sensor that drives renderer-side hover affordances in
 *     pinned mode.
 *
 * The controller intentionally knows nothing about use-cases or DTOs —
 * the IPC layer calls these methods AFTER application-layer work has run
 * and supplies the resulting `pinned` boolean (via `applyPinState`).
 */

/**
 * Safety net for the pin/unpin animation. AppKit's `setFrame:animate:`
 * normally settles in ~250 ms; if the bounds-equality fast-path in `move`
 * / `resize` callbacks never fires (e.g. pixel-rounding mismatch between
 * the bounds we requested and what AppKit committed), release the
 * animation lock anyway after this duration.
 */
const PIN_ANIM_FALLBACK_MS = 400;

interface ResizeState {
  startCursor: { x: number; y: number };
  startBounds: Bounds;
  draggedCorner: Corner;
}

export class DraftWindowController {
  private readonly win: BrowserWindow;

  private pinned = false;
  private dragging = false;
  private resizeState: ResizeState | null = null;

  private pinAnimating = false;
  private pinAnimationFallback: NodeJS.Timeout | null = null;
  // Target the current pin/unpin animation is interpolating toward.
  // Watched in `move` / `resize` callbacks to emit `animationDone` the
  // moment AppKit settles onto these exact pixel coordinates — that's
  // the true "the animation has finished" signal, not a hard-coded
  // duration. Without this, the drag overlay would visibly linger past
  // the real landing for ~30 ms.
  private pinAnimationTarget: Bounds | null = null;

  // Last corner the user pinned to. Tracked so that repinning brings the
  // panel back to where they left it, not always to the design-default
  // top-right.
  private lastPinnedCorner: Corner = 'tr';

  // User-customized pin width/height set via resize handles. `null` means
  // "follow the default": width = PIN_WIDTH, height = content-driven via
  // the renderer's ResizeObserver. Reset by the header's reset button.
  private customPinSize: { width: number; height: number } | null = null;

  constructor() {
    this.win = this.createWindow();
    this.attachWindowHandlers();
    this.attachNativeMouseObservers();
    this.attachHeaderHoverTracker();
  }

  // ---------- Public API used by the IPC layer and the hotkey ----------

  browserWindow(): BrowserWindow {
    return this.win;
  }

  webContents(): Electron.WebContents | null {
    if (this.win.isDestroyed()) return null;
    return this.win.webContents;
  }

  isVisible(): boolean {
    return !this.win.isDestroyed() && this.win.isVisible();
  }

  /**
   * Toggle the overlay visibility. Used by the global hotkey.
   *
   * On summon the window appears at the cursor's display center with NO
   * animation — the user hit a hotkey, not a UI control, and a "fly-in"
   * effect would feel wrong (Spotlight doesn't animate either).
   */
  toggle(): void {
    if (this.win.isDestroyed()) return;
    if (this.win.isVisible()) {
      this.win.hide();
      return;
    }
    this.centerOnCursorDisplay({ animate: false });
    this.win.show();
    this.win.focus();
    this.win.webContents.send('draft:hotkey');
  }

  /**
   * Hide the overlay only if it isn't pinned. Used by the renderer's
   * `IPC.DraftHide` channel — `Esc` while pinned should NOT close the
   * panel.
   */
  hideIfUnpinned(): void {
    if (this.win.isDestroyed()) return;
    if (this.win.isVisible() && !this.win.isAlwaysOnTop()) this.win.hide();
  }

  /**
   * Apply the window-side consequences of a pin/unpin toggle. The
   * use-case is run by the IPC layer; this method only translates the
   * resulting `pinned` boolean into window behavior.
   *
   * @param targetHeight Renderer-predicted height for the post-toggle
   *   layout. Honored as the exact animation target so the window only
   *   animates ONCE.
   */
  applyPinState(pinned: boolean, targetHeight?: number): void {
    this.pinned = pinned;
    if (this.win.isDestroyed()) return;
    this.win.setAlwaysOnTop(pinned, 'floating');
    this.win.setVisibleOnAllWorkspaces(pinned, { visibleOnFullScreen: true });
    // Pinned overlay can be dragged between corners; un-pinned is
    // immovable (Spotlight-style). `setMovable` works in tandem with
    // the `draft-drag` CSS class on the header: both have to allow the
    // move for AppKit to actually translate the window.
    this.win.setMovable(pinned);
    if (pinned) this.snapToCorner(this.lastPinnedCorner, { animate: true, targetHeight });
    else this.centerOnCursorDisplay({ animate: true, targetHeight });
  }

  /**
   * Renderer-driven height update (the ResizeObserver in the editor pushes
   * the current content height through `IPC.DraftResize`).
   *
   * Skipped while a pin/unpin animation owns setBounds — otherwise each
   * intermediate AppKit frame would race with a renderer-driven height
   * update and you'd see the window twitch. Also skipped while a custom
   * pin size is active: that size is the authoritative dimension until
   * reset.
   */
  applyContentHeight(rawHeight: number): void {
    if (this.win.isDestroyed()) return;
    if (this.pinAnimating) return;
    if (this.pinned && this.customPinSize) return;
    const display = screen.getDisplayMatching(this.win.getBounds());
    const minH = this.pinned ? 180 : 200;
    const maxH = this.pinned ? 360 : Math.round(display.workArea.height * 0.6);
    const next = Math.max(minH, Math.min(Math.round(rawHeight), maxH));
    const bounds = this.win.getBounds();
    if (Math.abs(next - bounds.height) < 2) return;
    const [w] = this.win.getSize();
    const width = w ?? 560;
    this.win.setBounds({ x: bounds.x, y: bounds.y, width, height: next });
  }

  /**
   * Manual resize from the renderer (drag of the corner handle). The
   * renderer ships a target width/height; we clamp to the pin's allowed
   * bracket and recompute x/y so the anchor (= last pinned corner) stays
   * pixel-pinned. This means the corner the user is NOT dragging never
   * moves — exactly the expectation for "resize from the opposite corner".
   */
  setPinSize(raw: { width: number; height: number }): void {
    if (this.win.isDestroyed()) return;
    if (!this.pinned) return;
    if (this.pinAnimating) return;
    const display = screen.getDisplayMatching(this.win.getBounds());
    const size = clampPinSize(display, raw);
    this.setCustomPinSize(size);
    const target = cornerBounds(display, this.lastPinnedCorner, size);
    const cur = this.win.getBounds();
    if (
      Math.abs(cur.width - target.width) < 1 &&
      Math.abs(cur.height - target.height) < 1 &&
      Math.abs(cur.x - target.x) < 1 &&
      Math.abs(cur.y - target.y) < 1
    ) {
      return;
    }
    this.setBoundsImmediate(target);
  }

  getCorner(): Corner {
    return this.lastPinnedCorner;
  }

  /**
   * Start a corner-handle resize gesture. From this point on the native
   * `mouseDrag` stream rewrites window bounds on every event, and the
   * companion `mouseUp` ends the gesture (see `attachNativeMouseObservers`).
   */
  beginResize(): void {
    if (this.win.isDestroyed()) return;
    if (!this.pinned) return;
    if (this.pinAnimating) return;
    this.resizeState = {
      startCursor: screen.getCursorScreenPoint(),
      startBounds: this.win.getBounds(),
      // The user grabbed the corner opposite the pin's anchor.
      draggedCorner: oppositeCorner(this.lastPinnedCorner),
    };
    // Turn off AppKit's "drag this window around" gesture while we own
    // the cursor stream. Without this, dragging the resize handle near
    // the top of the panel can race AppKit into starting a window move
    // — particularly visible when the pin is in a bottom corner and the
    // resize handle ends up over the header strip.
    this.win.setMovable(false);
  }

  /**
   * Animate back to the design-default pin size. The renderer switches
   * back to its content-fit layout (because `customSizeChanged` just
   * fired with `false`) and the ResizeObserver will tighten the height
   * further to fit the body once the animation settles.
   */
  resetPinSize(): void {
    if (this.win.isDestroyed()) return;
    if (!this.pinned) return;
    this.setCustomPinSize(null);
    const display = screen.getDisplayMatching(this.win.getBounds());
    const target = cornerBounds(display, this.lastPinnedCorner, {
      width: PIN_WIDTH,
      height: PIN_DEFAULT_HEIGHT,
    });
    this.animateBounds(target);
  }

  // ---------- Window construction ----------

  private createWindow(): BrowserWindow {
    const w = new BrowserWindow({
      width: 560,
      height: 220,
      // `frame: false` alone hides the title bar AND the macOS traffic
      // lights. Earlier we also passed `titleBarStyle: 'hidden'` — on
      // macOS that style implicitly re-introduces the stop-light
      // buttons, which is wrong for a Spotlight-style overlay. Plain
      // `frame: false` is the right call here.
      frame: false,
      transparent: true,
      resizable: false,
      // Un-pinned overlay must behave like Spotlight / Raycast: fixed at
      // the cursor display's center, not draggable. We start with
      // `movable: false` and toggle it on whenever the user pins the
      // panel (see `applyPinState`).
      movable: false,
      show: false,
      alwaysOnTop: false,
      skipTaskbar: true,
      fullscreenable: false,
      // Excluded from the macOS window switcher (⌘`) and Mission Control
      // — matches how Spotlight behaves.
      hiddenInMissionControl: true,
      vibrancy: 'under-window',
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // macOS `NSWindowSharingNone` via Electron's content-protection
    // bridge. The overlay stays fully visible to the local user but is
    // omitted from every screen-capture API (ScreenCaptureKit,
    // CGWindowList, AVFoundation), so Zoom / Meet / QuickTime viewers
    // don't see whatever the user is capturing in their scratch buffer.
    // Enabled unconditionally for the Draft window — the buffer can
    // hold sensitive text in BOTH pinned and un-pinned states, and the
    // cost is one constructor-time call.
    w.setContentProtection(true);

    loadRenderer(w, 'draft');
    return w;
  }

  private attachWindowHandlers(): void {
    // Hide on blur unless pinned — pinned drafts should stay put.
    this.win.on('blur', () => {
      if (this.win.isVisible() && !this.win.isAlwaysOnTop()) this.win.hide();
    });

    // Watch every `move`/`resize` callback while an animation is in
    // flight; emit `animationDone` the moment the window reaches the
    // target pixel coordinates. This is what unblocks the drag overlay
    // to fade out at the exact frame the snap lands, instead of a fixed
    // ~280 ms timer later.
    this.win.on('move', () => this.maybeFinishAnimation());
    this.win.on('resize', () => this.maybeFinishAnimation());

    // Tear down the AppKit observers when the window goes away —
    // otherwise the addon would hold a JS callback alive past the
    // window's lifetime.
    this.win.on('closed', () => {
      windowEvents.unsubscribe();
    });
  }

  // --- Native drag/resize observers (pinned mode only) ---
  //
  // The frameless window has `-webkit-app-region: drag` on its header in
  // pinned mode, so AppKit owns the actual window move. We track two
  // signals around it:
  //
  //   • "user is currently dragging": the `move` event fires for every
  //     frame of the AppKit move. A real drag never changes the window's
  //     size, only its x/y — programmatic resizes/animations always
  //     touch the size, so the size-equality check filters them out
  //     cleanly without needing a timing heuristic.
  //
  //   • "user released the button": delivered by the AppKit native addon
  //     `@inmemnote/window-events`, which installs an `NSEvent` global +
  //     local monitor for `NSEventMaskLeftMouseUp`. That catches the
  //     release instantly — including releases over other apps that
  //     BrowserWindow never sees — so the snap animation starts on the
  //     same run-loop tick as the actual button release, no debounce,
  //     no idle timer.
  //
  // Why main owns the "drag started" signal: AppKit fully swallows
  // `mousedown` over a `-webkit-app-region: drag` element, so the
  // renderer never sees the event — neither a React handler nor a
  // document-level capture-phase listener fires. The earliest reliable
  // thing we DO get is the addon's synchronous mousedown callback, which
  // arrives 1–2 ms after the press. We broadcast `draft:dragStart` from
  // there.
  private attachNativeMouseObservers(): void {
    windowEvents.subscribeToMouseDown(() => {
      if (!this.pinned) return;
      if (this.pinAnimating) return;
      // A resize gesture started elsewhere (via `beginResize`). It owns
      // the cursor stream until mouse-up; the header drag must NOT
      // compete.
      if (this.resizeState) return;
      if (!this.cursorOverDragHeader()) return;
      if (this.dragging) return;
      this.dragging = true;
      if (!this.win.isDestroyed()) this.win.webContents.send('draft:dragStart');
    });

    windowEvents.subscribeToMouseUp(() => {
      // First: end resize if one is in flight. Resize doesn't trigger a
      // drag-snap because the user explicitly set the window to a custom
      // size — the position was anchored to the pin corner all along.
      if (this.resizeState) {
        this.resizeState = null;
        // Re-enable AppKit window dragging. We turn it off in
        // `beginResize` so the system doesn't try to follow the cursor
        // with the whole window while we're driving manual `setBounds`
        // calls.
        if (!this.win.isDestroyed()) this.win.setMovable(true);
        return;
      }
      if (!this.dragging) return;
      this.dragging = false;
      if (this.win.isDestroyed()) return;
      const b = this.win.getBounds();
      const display = screen.getDisplayMatching(b);
      const home = cornerBounds(display, this.lastPinnedCorner, {
        width: b.width,
        height: b.height,
      });
      const moved = b.x !== home.x || b.y !== home.y;
      if (moved) {
        this.snapToCorner(cornerForBounds(b, display), { animate: true });
      } else {
        this.win.webContents.send('draft:dragEnd');
      }
    });

    // Resize stream. While `resizeState` is non-null, every native
    // mouse-drag callback re-applies the new size relative to the cursor
    // delta and the captured starting bounds. Anchor stays at the pin
    // corner so the corner the user is NOT dragging never moves.
    windowEvents.subscribeToMouseDrag(() => {
      if (!this.resizeState || this.win.isDestroyed()) return;
      const cursor = screen.getCursorScreenPoint();
      const dx = cursor.x - this.resizeState.startCursor.x;
      const dy = cursor.y - this.resizeState.startCursor.y;
      // `draggedCorner` is the diagonal opposite of the pin's anchor —
      // the corner whose handle the user is holding. Its sign tells us
      // which direction increases the size.
      const widthSign =
        this.resizeState.draggedCorner === 'tl' || this.resizeState.draggedCorner === 'bl' ? -1 : 1;
      const heightSign =
        this.resizeState.draggedCorner === 'tl' || this.resizeState.draggedCorner === 'tr' ? -1 : 1;
      const display = screen.getDisplayMatching(this.resizeState.startBounds);
      const raw = {
        width: this.resizeState.startBounds.width + widthSign * dx,
        height: this.resizeState.startBounds.height + heightSign * dy,
      };
      const size = clampPinSize(display, raw);
      this.setCustomPinSize(size);
      const target = cornerBounds(display, this.lastPinnedCorner, size);
      this.setBoundsImmediate(target);
    });
  }

  private attachHeaderHoverTracker(): void {
    // Pinned mode only — we filter in the callback rather than
    // installing/removing the AppKit subview on every pin toggle. The
    // subview stays attached for the window's whole lifetime: cheaper,
    // and avoids any mid-pin race where the user is already hovering at
    // the moment of toggle. Forwarded as `draft:headerHover` with a
    // boolean payload.
    windowEvents.installHeaderHoverTracker(
      this.win.getNativeWindowHandle(),
      HEADER_HEIGHT,
      (hovering: boolean) => {
        if (this.win.isDestroyed()) return;
        if (!this.pinned) return;
        this.win.webContents.send(IPC.DraftHeaderHover, hovering);
      },
    );
  }

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
  private cursorOverDragHeader(): boolean {
    if (this.win.isDestroyed()) return false;
    const b = this.win.getBounds();
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
    const handleAt = oppositeCorner(this.lastPinnedCorner);
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
  }

  // ---------- Animation + layout primitives ----------

  private setBoundsImmediate(target: Bounds): void {
    this.win.setBounds(target, false);
  }

  /**
   * Animate the window to `target` using AppKit's native curve.
   *
   * Strictly used for pin/unpin transitions — first-paint summon takes
   * the `setBoundsImmediate` path so the overlay doesn't "fly in" from
   * its previous position when the user hits the global hotkey.
   *
   * AppKit's animated `setFrame:animate:` is driven by the same
   * WindowServer pipeline that draws every other macOS window, so it
   * lands on the display's native refresh rate (60 Hz on most panels,
   * ProMotion when supported). Built-in curve is a smooth ease-out —
   * exactly the "iOS-feel" we want.
   *
   * We previously hand-rolled a JS 60 Hz loop calling `setBounds(_,
   * false)` every 16 ms, but on a frameless + transparent window each
   * call costs an expensive compositor pass: the effective frame rate
   * degraded to ~30 fps and the motion looked choppy. Pushing the work
   * to AppKit gives us actual 60 fps for free.
   */
  private animateBounds(target: Bounds): void {
    if (this.pinAnimationFallback) {
      clearTimeout(this.pinAnimationFallback);
      this.pinAnimationFallback = null;
    }
    const start = this.win.getBounds();
    if (
      start.x === target.x &&
      start.y === target.y &&
      start.width === target.width &&
      start.height === target.height
    ) {
      this.win.webContents.send('draft:animationDone');
      return;
    }

    this.pinAnimating = true;
    this.pinAnimationTarget = target;
    // Tell the renderer to mute its ResizeObserver — otherwise every
    // intermediate frame AppKit produces would round-trip an IPC resize
    // request that competes with the running native animation.
    this.win.webContents.send('draft:animationStart');
    this.win.setBounds(target, true);

    // Fallback only — primary completion path is the bounds-equality
    // check in the `move`/`resize` handlers.
    this.pinAnimationFallback = setTimeout(() => this.finishAnimation(), PIN_ANIM_FALLBACK_MS);
  }

  private finishAnimation(): void {
    if (!this.pinAnimating) return;
    this.pinAnimating = false;
    this.pinAnimationTarget = null;
    if (this.pinAnimationFallback) {
      clearTimeout(this.pinAnimationFallback);
      this.pinAnimationFallback = null;
    }
    if (!this.win.isDestroyed()) this.win.webContents.send('draft:animationDone');
  }

  /**
   * Called on every AppKit `move` / `resize` callback while an
   * animation is in flight. If the window has reached the target pixel
   * coordinates, settle the animation immediately — no waiting for the
   * timer fallback.
   */
  private maybeFinishAnimation(): void {
    if (!this.pinAnimating || !this.pinAnimationTarget) return;
    const b = this.win.getBounds();
    const t = this.pinAnimationTarget;
    if (b.x === t.x && b.y === t.y && b.width === t.width && b.height === t.height) {
      this.finishAnimation();
    }
  }

  private centerOnCursorDisplay(opts: LayoutOpts): void {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const height = opts.targetHeight ?? this.win.getBounds().height ?? 220;
    const target: Bounds = {
      x: Math.round(display.workArea.x + (display.workArea.width - DRAFT_DEFAULT_WIDTH) / 2),
      y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
      width: DRAFT_DEFAULT_WIDTH,
      height,
    };
    if (opts.animate) this.animateBounds(target);
    else this.setBoundsImmediate(target);
  }

  /**
   * Park the window in `corner` of the current display.
   *
   * Used both for the initial pin transition (with the corner the user
   * last picked) and for the drag-and-snap flow (with the corner the
   * user just dropped the window into).
   */
  private snapToCorner(corner: Corner, opts: LayoutOpts): void {
    const display = screen.getDisplayMatching(this.win.getBounds());
    const size = this.effectivePinSize(opts.targetHeight);
    const target = cornerBounds(display, corner, size);
    if (corner !== this.lastPinnedCorner) {
      this.lastPinnedCorner = corner;
      if (!this.win.isDestroyed()) this.win.webContents.send('draft:cornerChanged', corner);
    }
    if (opts.animate) this.animateBounds(target);
    else this.setBoundsImmediate(target);
  }

  /**
   * Pin size used by `snapToCorner` callers that don't supply an
   * explicit `targetHeight`. Honors the user's custom size when
   * present, otherwise falls back to the design default width and a
   * sensible default height.
   */
  private effectivePinSize(targetHeight?: number): { width: number; height: number } {
    if (this.customPinSize) return this.customPinSize;
    return { width: PIN_WIDTH, height: targetHeight ?? this.win.getBounds().height ?? 220 };
  }

  private setCustomPinSize(next: { width: number; height: number } | null): void {
    const wasActive = this.customPinSize !== null;
    this.customPinSize = next;
    const isActive = next !== null;
    if (wasActive !== isActive && !this.win.isDestroyed()) {
      this.win.webContents.send(IPC.DraftCustomSizeChanged, isActive);
    }
  }
}
