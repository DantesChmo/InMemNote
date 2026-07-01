import type { AppVersion } from './AppVersion';

/**
 * A release discovered on the update feed.
 *
 * Pure data — no knowledge of GitHub or Electron. The `ReleaseGateway`
 * (infrastructure) translates whatever the feed returns into this shape, and
 * the `UpdateInstaller` consumes `downloadUrl` to fetch the artifact.
 */
export interface ReleaseInfo {
  /** Parsed version of the release (from its tag). */
  readonly version: AppVersion;
  /** Direct download URL of the macOS `.dmg` asset. */
  readonly downloadUrl: string;
  /** Human-facing release-notes page (opened in the browser on request). */
  readonly notesUrl: string;
}
