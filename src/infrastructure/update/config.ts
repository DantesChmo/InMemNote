/**
 * Where the updater looks for new releases.
 *
 * These mirror the values baked into `scripts/install.sh` and the release job
 * in `.github/workflows/ci.yml` — the same repo, the same stable asset name
 * (`--clobber`ed onto every release). Kept in one module so a repo rename or
 * an asset-name change is a single edit, not a scavenger hunt across the
 * shell installer, CI, and the app.
 */
export const UPDATE_REPO = { owner: 'DantesChmo', name: 'InMemNote' } as const;

/** Stable, version-independent DMG asset name attached to every release. */
export const UPDATE_ASSET = 'Inmemnote-macos-arm64.dmg';

/** Bundle name inside the DMG and under `/Applications`. */
export const APP_BUNDLE_NAME = 'Inmemnote.app';

/** GitHub REST endpoint for the newest published release. */
export const LATEST_RELEASE_API = `https://api.github.com/repos/${UPDATE_REPO.owner}/${UPDATE_REPO.name}/releases/latest`;

/** Fallback direct-download URL that always resolves to the newest asset. */
export const LATEST_ASSET_URL = `https://github.com/${UPDATE_REPO.owner}/${UPDATE_REPO.name}/releases/latest/download/${UPDATE_ASSET}`;
