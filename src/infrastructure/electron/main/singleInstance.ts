/**
 * The slice of Electron's `app` the single-instance guard needs. Narrow on
 * purpose so the guard can be unit-tested without booting Electron.
 */
export interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean;
  isReady(): boolean;
  quit(): void;
  on(event: 'second-instance', listener: () => void): unknown;
}

/**
 * Make sure only one Inmemnote process runs per userData directory.
 *
 * A second process would open the same `inmemnote.db` and fight over the
 * global hotkey. Electron scopes the lock to the userData directory, so the
 * caller MUST apply any `app.setPath('userData', …)` override first — that is
 * what lets parallel E2E runs (each with its own `INMEMNOTE_USER_DATA`) boot
 * side by side.
 *
 * Returns `true` when this process owns the lock and should continue
 * booting. Returns `false` after asking the app to quit — the caller must
 * then skip ALL initialisation (container, windows, hotkey).
 */
export function claimSingleInstance(
  app: SingleInstanceApp,
  onSecondInstance: () => void,
): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on('second-instance', () => {
    // Before `ready` no window may be created yet; the normal boot path
    // opens the Library anyway, so the launch attempt needs no extra work.
    if (app.isReady()) onSecondInstance();
  });
  return true;
}
