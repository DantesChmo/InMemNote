/**
 * Subscribe to global left-mouse-up events on macOS. Fires for every
 * release the system sees, including releases over other applications —
 * essential for catching the end of a window drag that overshoots our own
 * bounds. Idempotent: a second call before `unsubscribe()` is a no-op.
 */
export function subscribeToMouseUp(callback: () => void): void;

/**
 * Subscribe to global left-mouse-down events on macOS. Same semantics as
 * `subscribeToMouseUp`. Used to detect the start of a window drag inside
 * the `-webkit-app-region: drag` zone, where DOM `mousedown` is consumed
 * by AppKit before any renderer code can see it.
 */
export function subscribeToMouseDown(callback: () => void): void;

/** Remove every AppKit observer this module installed. */
export function unsubscribe(): void;
