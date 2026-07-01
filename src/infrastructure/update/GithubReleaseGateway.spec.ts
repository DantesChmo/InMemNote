import { describe, expect, it, vi } from 'vitest';

import { LATEST_ASSET_URL, UPDATE_ASSET } from './config';
import { GithubReleaseGateway } from './GithubReleaseGateway';

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
  }) as Response;

describe('GithubReleaseGateway', () => {
  it('parses tag, notes URL, and the matching asset download URL', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        tag_name: 'v0.6.0',
        html_url: 'https://github.com/DantesChmo/InMemNote/releases/tag/v0.6.0',
        assets: [
          { name: 'other.zip', browser_download_url: 'https://x/other.zip' },
          { name: UPDATE_ASSET, browser_download_url: 'https://x/0.6.0.dmg' },
        ],
      }),
    );

    const info = await new GithubReleaseGateway(fetchFn).fetchLatest();

    expect(info.version.toString()).toBe('0.6.0');
    expect(info.downloadUrl).toBe('https://x/0.6.0.dmg');
    expect(info.notesUrl).toContain('/releases/tag/v0.6.0');
  });

  it('falls back to the stable asset URL when the asset is missing', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ tag_name: 'v0.6.0', html_url: 'https://x', assets: [] }),
    );
    const info = await new GithubReleaseGateway(fetchFn).fetchLatest();
    expect(info.downloadUrl).toBe(LATEST_ASSET_URL);
  });

  it('throws on a non-OK HTTP status', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, false, 403));
    await expect(new GithubReleaseGateway(fetchFn).fetchLatest()).rejects.toThrow('403');
  });

  it('throws on an unparseable tag', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ tag_name: 'nightly', html_url: 'https://x', assets: [] }),
    );
    await expect(new GithubReleaseGateway(fetchFn).fetchLatest()).rejects.toThrow('nightly');
  });
});
