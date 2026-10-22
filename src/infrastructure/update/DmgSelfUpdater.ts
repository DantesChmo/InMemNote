import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { chmod, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { app } from 'electron';

import { APP_BUNDLE_NAME } from './config';

import type { ReleaseInfo } from '@domain/update/ReleaseInfo';
import type { UpdateInstaller } from '@domain/update/UpdateInstaller';

/**
 * macOS self-updater that needs no Apple Developer ID.
 *
 * Squirrel.Mac (what `update-electron-app` drives) refuses to apply an update
 * whose code signature isn't a valid, matching Developer ID — which this app
 * deliberately doesn't have (it ships ad-hoc-signed; see docs/RELEASING.md).
 * So we don't use Squirrel at all. Instead we reproduce exactly what
 * `scripts/install.sh` does, but from inside the app:
 *
 *   1. download the release DMG to a temp dir (streaming, with progress);
 *   2. write a tiny detached helper shell script;
 *   3. spawn it un-tethered and, once it is confirmed running, quit — the
 *      running app can't replace its own live bundle, so the helper waits for
 *      our PID to exit first, then mounts the DMG, swaps
 *      `/Applications/Inmemnote.app` (atomically, with rollback), strips the
 *      quarantine flag, and relaunches.
 *
 * Because `curl`/`cp` never set `com.apple.quarantine`, the relaunched build
 * opens with no Gatekeeper prompt, even when the first copy came from a
 * browser-downloaded DMG and needed Open Anyway.
 */

/** Seams the orchestration talks to — swapped for fakes in unit tests. */
export interface SelfUpdaterDeps {
  /** Stream `url` into `dest`, reporting 0..1 completion when size is known. */
  download(url: string, dest: string, onProgress?: (fraction: number) => void): Promise<void>;
  /** Persist the helper script and make it executable. */
  writeScript(path: string, contents: string): Promise<void>;
  /**
   * Launch the helper fully detached so it outlives this process. Resolves
   * once the child has started; rejects if it couldn't be (ENOENT, EACCES…).
   */
  spawnDetached(command: string, args: string[]): Promise<void>;
  /** Quit the app so the helper can replace the bundle. */
  quit(): void;
  /** Temp directory to stage the DMG + script in. */
  tmpDir: string;
  /** PID the helper waits on before swapping the bundle. */
  pid: number;
  /** Optional progress relay (download fraction) for the UI. */
  onProgress?: (fraction: number) => void;
}

/**
 * The helper. `$1` = PID to wait on, `$2` = downloaded DMG path, `$3` =
 * install directory (defaults to `/Applications` — the documented install
 * location, where the launcher and Dock already point; tests pass a sandbox).
 *
 * The swap must never leave the user without an app: the new bundle is copied
 * to a hidden staging path *inside the install directory* (same volume, so the
 * later `mv`s are atomic renames, not copies), the old bundle is renamed to a
 * backup, the staged one is renamed into place, and only then is the backup
 * deleted. Any failure up to that point removes the staging copy, puts the
 * backup back and relaunches the old version. `set -e` is deliberately not
 * used: every failure is routed through `fail` so the rollback always runs.
 * Staging/backup names carry `$$` so a crashed earlier run's leftovers are
 * never mistaken for (or deleted as) this run's.
 */
export const HELPER_SCRIPT = `#!/bin/bash
set -uo pipefail
pid="$1"
dmg="$2"
dest="\${3:-/Applications}"
app="$dest/${APP_BUNDLE_NAME}"
staged="$dest/.${APP_BUNDLE_NAME}.new-$$"
backup="$dest/.${APP_BUNDLE_NAME}.old-$$"
mount="$(mktemp -d)"

cleanup() {
  hdiutil detach "$mount" -force >/dev/null 2>&1 || true
  rm -rf "$mount" "$dmg"
}
trap cleanup EXIT

relaunch() {
  # curl/cp don't quarantine, but strip defensively so the relaunch is prompt-free.
  xattr -dr com.apple.quarantine "$app" 2>/dev/null || true
  open "$app" || true
}

fail() {
  echo "inmemnote-update: $1" >&2
  rm -rf "$staged"
  if [[ -e "$backup" ]]; then
    rm -rf "$app"
    mv "$backup" "$app" || echo "inmemnote-update: could not restore $backup" >&2
  fi
  relaunch
  exit 1
}

# Wait for the running app to exit; we can't overwrite a live bundle.
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done

hdiutil attach "$dmg" -nobrowse -noautoopen -noverify -mountpoint "$mount" >/dev/null \\
  || fail "could not mount $dmg"
cp -R "$mount/${APP_BUNDLE_NAME}" "$staged" || fail "could not copy the new bundle"
[[ -f "$staged/Contents/Info.plist" ]] || fail "the new bundle is incomplete"
if [[ -e "$app" ]]; then
  mv "$app" "$backup" || fail "could not move the old bundle aside"
fi
mv "$staged" "$app" || fail "could not move the new bundle into place"
rm -rf "$backup" || true

relaunch
`;

export class DmgSelfUpdater implements UpdateInstaller {
  public constructor(private readonly deps: SelfUpdaterDeps) {}

  public async install(release: ReleaseInfo): Promise<void> {
    const dmgPath = join(this.deps.tmpDir, 'Inmemnote-update.dmg');
    const scriptPath = join(this.deps.tmpDir, 'inmemnote-update.sh');

    await this.deps.download(release.downloadUrl, dmgPath, this.deps.onProgress);
    await this.deps.writeScript(scriptPath, HELPER_SCRIPT);
    // Quit only once the helper is confirmed running: without it nothing would
    // swap the bundle or relaunch the app. A rejection here propagates to
    // InstallUpdateUseCase and the banner offers a retry.
    await this.deps.spawnDetached('/bin/bash', [scriptPath, String(this.deps.pid), dmgPath]);
    this.deps.quit();
  }
}

// ---------- Real (Electron/Node) wiring ----------

/** Stream a URL to disk, emitting a 0..1 fraction when Content-Length is known. */
async function nodeDownload(
  url: string,
  dest: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const total = Number(response.headers.get('content-length') ?? 0);
  let received = 0;
  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  if (total > 0 && onProgress) {
    source.on('data', (chunk: Buffer) => {
      received += chunk.length;
      onProgress(received / total);
    });
  }

  await pipeline(source, createWriteStream(dest));
}

async function nodeWriteScript(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, 'utf8');
  await chmod(path, 0o755);
}

export function nodeSpawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    // `spawn` reports a failed start asynchronously via 'error', never by
    // throwing. The listener stays attached after 'spawn' (settling twice is a
    // no-op) so a late 'error' can't surface as an uncaught exception.
    child.on('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/**
 * Wire the updater against the real platform. `onProgress` is relayed to the
 * UI (download percentage) by the IPC layer.
 */
export function createDmgSelfUpdater(onProgress?: (fraction: number) => void): DmgSelfUpdater {
  return new DmgSelfUpdater({
    download: nodeDownload,
    writeScript: nodeWriteScript,
    spawnDetached: nodeSpawnDetached,
    quit: () => app.quit(),
    tmpDir: tmpdir(),
    pid: process.pid,
    onProgress,
  });
}
