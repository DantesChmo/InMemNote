/**
 * Subscribe to global left-mouse-up events on macOS. Fires for every
 * release the system sees, including releases over other applications —
 * essential for catching the end of a window drag that overshoots our own
 * bounds. Idempotent: a second call before `unsubscribe()` is a no-op.
 */
export function subscribeToMouseUp(callback: () => void): void;

/** Remove the AppKit observers installed by `subscribeToMouseUp`. */
export function unsubscribe(): void;
