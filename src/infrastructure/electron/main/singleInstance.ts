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
 * Returns `true` when this process owns the lock and should continue
 * booting. Returns `false` after asking the app to quit — the caller must
 * then skip ALL initialisation (container, windows, hotkey).
 */
export function claimSingleInstance(
  _app: SingleInstanceApp,
  _onSecondInstance: () => void,
): boolean {
  throw new Error('not implemented');
}
