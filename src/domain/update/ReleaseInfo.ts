import type { AppVersion } from './AppVersion';

/**
 * A release discovered on the update feed.
 *
 * Pure data — no knowledge of GitHub or Electron. The `ReleaseGateway`
 * (infrastructure) translates whatever the feed returns into this shape, and
 * the `UpdateInstaller` consumes `downloadUrl` to fetch the artifact and,
 * when present, `checksumUrl` to verify it.
 */
export interface ReleaseInfo {
  /** Parsed version of the release (from its tag). */
  readonly version: AppVersion;
  /** Direct download URL of the macOS `.dmg` asset. */
  readonly downloadUrl: string;
  /**
   * Direct download URL of the DMG's SHA-256 file (`shasum -a 256` output).
   * Absent for releases published before checksums were (≤ v0.6.0); those
   * install unverified. The digest guards against a corrupted download, not
   * against a tampered release (ADR 0007).
   */
  readonly checksumUrl?: string;
  /** Human-facing release-notes page (opened in the browser on request). */
  readonly notesUrl: string;
}
