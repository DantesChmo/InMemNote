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
 * deliberately doesn't have (it ships ad-hoc-signed and installs via `curl`
 * to dodge Gatekeeper's quarantine; see README). So we don't use Squirrel at
 * all. Instead we reproduce exactly what `scripts/install.sh` does, but from
 * inside the app:
 *
 *   1. download the release DMG to a temp dir (streaming, with progress);
 *   2. write a tiny detached helper shell script;
 *   3. spawn it un-tethered and quit — the running app can't replace its own
 *      live bundle, so the helper waits for our PID to exit first, then
 *      mounts the DMG, swaps `/Applications/Inmemnote.app`, strips the
 *      quarantine flag, and relaunches.
 *
 * Because `curl`/`cp` never set `com.apple.quarantine`, the relaunched build
 * opens with no Gatekeeper prompt — the same reason the first-run installer
 * uses `curl` instead of a browser download.
 */

/** Seams the orchestration talks to — swapped for fakes in unit tests. */
export interface SelfUpdaterDeps {
  /** Stream `url` into `dest`, reporting 0..1 completion when size is known. */
  download(url: string, dest: string, onProgress?: (fraction: number) => void): Promise<void>;
  /** Persist the helper script and make it executable. */
  writeScript(path: string, contents: string): Promise<void>;
  /** Launch the helper fully detached so it outlives this process. */
  spawnDetached(command: string, args: string[]): void;
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
 * The helper. `$1` = PID to wait on, `$2` = downloaded DMG path. The target
 * bundle is hardcoded to `/Applications` — the documented install location
 * (`install.sh` installs there too), so an in-place update lands where the
 * launcher and Dock already point.
 */
export const HELPER_SCRIPT = `#!/bin/bash
set -euo pipefail
pid="$1"
dmg="$2"
app="/Applications/${APP_BUNDLE_NAME}"
mount="$(mktemp -d)"

cleanup() {
  hdiutil detach "$mount" -force >/dev/null 2>&1 || true
  rm -rf "$mount" "$dmg"
}
trap cleanup EXIT

# Wait for the running app to exit; we can't overwrite a live bundle.
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done

hdiutil attach "$dmg" -nobrowse -noautoopen -noverify -mountpoint "$mount" >/dev/null
rm -rf "$app"
cp -R "$mount/${APP_BUNDLE_NAME}" /Applications/
hdiutil detach "$mount" -force >/dev/null 2>&1 || true

# curl/cp don't quarantine, but strip defensively so the relaunch is prompt-free.
xattr -dr com.apple.quarantine "$app" 2>/dev/null || true
open "$app"
`;

export class DmgSelfUpdater implements UpdateInstaller {
  public constructor(private readonly deps: SelfUpdaterDeps) {}

  public async install(release: ReleaseInfo): Promise<void> {
    const dmgPath = join(this.deps.tmpDir, 'Inmemnote-update.dmg');
    const scriptPath = join(this.deps.tmpDir, 'inmemnote-update.sh');

    await this.deps.download(release.downloadUrl, dmgPath, this.deps.onProgress);
    await this.deps.writeScript(scriptPath, HELPER_SCRIPT);
    this.deps.spawnDetached('/bin/bash', [scriptPath, String(this.deps.pid), dmgPath]);
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

function nodeSpawnDetached(command: string, args: string[]): void {
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
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
