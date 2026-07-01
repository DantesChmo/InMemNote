import type { ReleaseInfo } from './ReleaseInfo';

/**
 * Port for reading the latest published release.
 *
 * The production implementation talks to the GitHub Releases API; tests use a
 * stub. `fetchLatest` throws on a transport/parse failure — the
 * `CheckForUpdateUseCase` wraps that into a `Result` so the caller can treat a
 * missing network as "no update right now" rather than a crash.
 */
export interface ReleaseGateway {
  fetchLatest(): Promise<ReleaseInfo>;
}
