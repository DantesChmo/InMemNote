import type { Unsubscribe } from './subscription';

/**
 * IPC contract for auto-update: channel names, wire DTOs and the
 * `window.inmemnote.update` surface. Pure types + constants — see ADR 0005.
 */

export const UpdateChannels = {
  /** Renderer asks main to check the release feed now. Resolves to a DTO or null. */
  UpdateCheck: 'update:check',
  /** Renderer asks main to download + install the pending update and relaunch. */
  UpdateInstall: 'update:install',
  /**
   * Main broadcast: a newer release was found (by the startup / periodic check
   * or an explicit request). The Library window surfaces its update banner.
   */
  UpdateAvailable: 'update:available',
  /** Main broadcast: download progress during an install, as a 0..1 fraction. */
  UpdateProgress: 'update:progress',
} as const;

/**
 * A newer release, as it crosses IPC to the renderer's update banner.
 * The domain `ReleaseInfo` carries an `AppVersion` object that can't survive
 * the bridge, so we ship the version as a plain `"0.6.0"` string.
 */
export interface AvailableUpdateDTO {
  version: string;
  downloadUrl: string;
  notesUrl: string;
}

export interface UpdateBridge {
  /** Ask main to check the release feed now. Resolves to a DTO or `null`. */
  check(): Promise<AvailableUpdateDTO | null>;
  /**
   * Download + install the pending update and relaunch. Resolves once the
   * hand-off succeeded (the app then quits); rejects if it failed.
   */
  install(): Promise<void>;
  /** Subscribe to "a newer release was found" broadcasts from the startup/periodic check. */
  onAvailable(handler: (update: AvailableUpdateDTO) => void): Unsubscribe;
  /** Subscribe to download-progress (0..1) during an install. */
  onProgress(handler: (fraction: number) => void): Unsubscribe;
}
