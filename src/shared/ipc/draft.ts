import type { NoteDTO } from './notes';
import type { Unsubscribe } from './subscription';

/**
 * IPC contract for the Draft overlay: channel names, wire DTOs and the
 * `window.inmemnote.draft` surface. Pure types + constants — see ADR 0005.
 */

export const DraftChannels = {
  DraftOpen: 'draft:open',
  DraftSave: 'draft:save',
  DraftClose: 'draft:close',
  DraftTogglePin: 'draft:togglePin',
  DraftHide: 'draft:hide',
  DraftResize: 'draft:resize',
  DraftPromote: 'draft:promote',
  /** Renderer-driven manual resize of the pinned overlay (width + height). */
  DraftSetPinSize: 'draft:setPinSize',
  /** Restore the pinned overlay to its default width/height. */
  DraftResetPinSize: 'draft:resetPinSize',
  /** Renderer asks main "which corner is the pin currently anchored to?" */
  DraftGetCorner: 'draft:getCorner',
  /**
   * Tell main "the user just grabbed the resize handle". Main captures the
   * current cursor position + window bounds and starts following the
   * AppKit-level mouse-drag stream until the next mouse-up.
   */
  DraftBeginResize: 'draft:beginResize',
  /** Main push: the global hotkey was pressed. */
  DraftHotkey: 'draft:hotkey',
  /** Main push: the user started dragging the pinned window by its header. */
  DraftDragStart: 'draft:dragStart',
  /** Main push: the header drag ended. */
  DraftDragEnd: 'draft:dragEnd',
  /** Main push: AppKit started the pin/unpin window animation. */
  DraftAnimationStart: 'draft:animationStart',
  /** Main push: the pin/unpin window animation landed. */
  DraftAnimationDone: 'draft:animationDone',
  /** Main push: the pinned overlay snapped to a different corner. */
  DraftCornerChanged: 'draft:cornerChanged',
  /**
   * Main broadcast: "the panel is now sized by the user, not by content".
   * Renderer flips the body layout from fit-content (with max-height) to
   * `flex: 1` so the editor fills whatever bounds main hands the window.
   */
  DraftCustomSizeChanged: 'draft:customSizeChanged',
  /**
   * Main pushes hover state for the pinned-window header strip. Detected
   * natively via `NSTrackingArea` because CSS `:hover` doesn't fire on
   * elements with `-webkit-app-region: drag`. Only emitted while the
   * window is pinned — un-pinned mode never highlights.
   */
  DraftHeaderHover: 'draft:headerHover',
} as const;

/**
 * The shape of a draft as it travels through IPC. Domain objects can't cross
 * the bridge (they contain methods/private fields), so we ship a plain DTO.
 */
export interface DraftDTO {
  id: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The four corner slots the pinned Draft overlay can occupy. */
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface PinSize {
  width: number;
  height: number;
}

export interface DraftBridge {
  open(): Promise<DraftDTO>;
  save(id: string, content: string): Promise<DraftDTO>;
  close(id: string): Promise<void>;
  /**
   * `targetHeight` is the post-toggle panel height the renderer predicted,
   * so main animates the window once to the right size instead of twice.
   */
  togglePin(id: string, targetHeight?: number): Promise<DraftDTO>;
  hide(): Promise<void>;
  /**
   * Ask main to resize the BrowserWindow so its content area matches the
   * renderer's measured panel height. Width stays fixed (the design defines
   * a single width per mode). Main clamps the result to a sane range.
   */
  resize(height: number): Promise<void>;
  /**
   * Move the current draft into the library (⌘↵). Returns the new note's
   * DTO, or `null` if the draft was empty and got silently discarded.
   */
  promote(id: string): Promise<NoteDTO | null>;
  /**
   * Subscribe to "the global hotkey was pressed" events from main.
   * Callers must call the returned unsubscribe in `useEffect` cleanup to
   * avoid stacked listeners on hot-reload.
   */
  onHotkey(handler: () => void): Unsubscribe;
  /**
   * Subscribe to "the pin/unpin animation just finished" broadcasts.
   * Main drives the OS window animation itself; when it lands, the
   * renderer is expected to remeasure the panel and push the real,
   * content-fit height via `resize`.
   */
  onAnimationDone(handler: () => void): Unsubscribe;
  /**
   * Counterpart to `onAnimationDone`: lets the renderer freeze the
   * `ResizeObserver`-driven height updates while AppKit is animating.
   * Without this, every intermediate frame becomes an IPC roundtrip and
   * the resize-handler races the animation itself.
   */
  onAnimationStart(handler: () => void): Unsubscribe;
  /**
   * "User started dragging the pinned window by its header" — main
   * detects this via the `move` event on the BrowserWindow. The renderer
   * uses it to surface a tint overlay so the user sees their gesture is
   * being tracked.
   */
  onDragStart(handler: () => void): Unsubscribe;
  onDragEnd(handler: () => void): Unsubscribe;
  /**
   * Manually resize the pinned panel. Main clamps to the pin's
   * width/height bracket and re-anchors the window so the corner the
   * user is *not* dragging stays still.
   */
  setPinSize(size: PinSize): Promise<void>;
  /** Drop any user-set custom size and animate back to the default. */
  resetPinSize(): Promise<void>;
  /** Fetch the corner the pin is currently anchored to. */
  getCorner(): Promise<Corner>;
  /**
   * Subscribe to "user-customized-size" flag changes. `true` means the
   * pinned overlay should fill the window; `false` means content drives
   * height via the ResizeObserver path.
   */
  onCustomSizeChanged(handler: (active: boolean) => void): Unsubscribe;
  /**
   * Start tracking a resize drag. Main records the current cursor and
   * window state, then drives `setBounds` directly off the native AppKit
   * mouse-drag stream until the mouse is released. The renderer doesn't
   * need a `mousemove` listener at all.
   */
  beginResize(): Promise<void>;
  /**
   * Main broadcasts this every time the active pin corner changes
   * (drag-to-corner snap). Renderer uses it to position the resize
   * handle on the diagonally-opposite corner.
   */
  onCornerChanged(handler: (corner: Corner) => void): Unsubscribe;
  /**
   * Hover state for the pinned header. Source is `NSTrackingArea` on a
   * sensor subview in main, not CSS — `:hover` doesn't fire on
   * `-webkit-app-region: drag` zones, so this is the only way to know
   * the cursor is over the drag strip.
   */
  onHeaderHover(handler: (hovering: boolean) => void): Unsubscribe;
}
