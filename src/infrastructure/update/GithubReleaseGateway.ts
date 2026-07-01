import { AppVersion } from '@domain/update/AppVersion';

import { LATEST_ASSET_URL, LATEST_RELEASE_API, UPDATE_ASSET } from './config';

import type { ReleaseGateway } from '@domain/update/ReleaseGateway';
import type { ReleaseInfo } from '@domain/update/ReleaseInfo';

/**
 * Reads the newest release straight off the public GitHub Releases API.
 *
 * No token, no cloud of our own — the anonymous endpoint is enough for a
 * per-machine check every few hours (well under GitHub's 60 req/h/IP limit).
 * This keeps the "no backend" promise in CLAUDE.md: the update feed IS the
 * GitHub release the CI `build` job already publishes.
 *
 * We resolve the download URL from the release's own asset list so we fetch
 * exactly the version we detected; if the asset is somehow absent we fall
 * back to the stable `/latest/download/` URL (the one `install.sh` uses).
 */

/** Minimal shape we read out of the GitHub API response. */
interface GithubReleaseResponse {
  tag_name: string;
  html_url: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

/** Injected for tests; defaults to the platform `fetch`. */
type FetchFn = typeof fetch;

export class GithubReleaseGateway implements ReleaseGateway {
  public constructor(private readonly fetchFn: FetchFn = fetch) {}

  public async fetchLatest(): Promise<ReleaseInfo> {
    const response = await this.fetchFn(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) {
      throw new Error(`GitHub API responded ${response.status}`);
    }

    const body = (await response.json()) as GithubReleaseResponse;
    const versionResult = AppVersion.create(body.tag_name);
    if (!versionResult.ok) {
      throw new Error(`Unparseable release tag "${body.tag_name}"`);
    }

    const asset = body.assets?.find((a) => a.name === UPDATE_ASSET);
    return {
      version: versionResult.value,
      downloadUrl: asset?.browser_download_url ?? LATEST_ASSET_URL,
      notesUrl: body.html_url,
    };
  }
}
