/**
 * Subscribe to global left-mouse-up events on macOS. Fires for every
 * release the system sees, including releases over other applications.
 * Idempotent: a second call before `unsubscribe()` is a no-op.
 */
export function subscribeToMouseUp(callback: () => void): void;

/**
 * Subscribe to global left-mouse-down events on macOS. Used to detect
 * the start of a window drag inside the `-webkit-app-region: drag` zone,
 * where DOM `mousedown` is consumed by AppKit before any renderer code
 * can see it.
 */
export function subscribeToMouseDown(callback: () => void): void;

/**
 * Subscribe to global left-mouse-DRAG events on macOS. Fires only while
 * the left button is held AND the cursor is moving. Used to drive
 * frame-by-frame `setBounds` during a custom resize, without any DOM
 * `mousemove` listener in the renderer (which can be eaten by AppKit
 * drag regions or otherwise miss events outside the window).
 */
export function subscribeToMouseDrag(callback: () => void): void;

/**
 * Attach an `NSTrackingArea` to a sensor subview pinned over the top
 * `headerHeight` strip of the given window's content view. Fires the
 * callback with `true` when the cursor enters the strip and `false` when
 * it leaves. Costs nothing while the cursor is idle — AppKit only signals
 * the two boundary crossings, not every pixel of movement.
 *
 * Idempotent: a second call before `removeHeaderHoverTracker` is a no-op.
 *
 * @param windowHandle   `BrowserWindow.getNativeWindowHandle()` Buffer
 *                       (on macOS this contains the content view pointer).
 * @param headerHeight   Height of the strip to observe, in points.
 * @param callback       `(entered: boolean) => void`
 */
export function installHeaderHoverTracker(
  windowHandle: Buffer,
  headerHeight: number,
  callback: (entered: boolean) => void,
): void;

/** Remove the header hover sensor installed by `installHeaderHoverTracker`. */
export function removeHeaderHoverTracker(): void;

/** Remove every AppKit observer this module installed. */
export function unsubscribe(): void;
