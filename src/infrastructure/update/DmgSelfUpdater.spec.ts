// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AppVersion } from '@domain/update/AppVersion';
import { unwrap } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module imports `app` from electron at load time; stub it so the module
// evaluates outside the Electron runtime. The unit under test uses injected
// deps, not the real factory, so the stub is never actually called.
vi.mock('electron', () => ({ app: { quit: vi.fn() } }));

import {
  createShellSandbox,
  deadPid,
  makeUnreadable,
  type ShellSandbox,
} from '../../test/shellSandbox';

import {
  DmgSelfUpdater,
  HELPER_SCRIPT,
  nodeSha256File,
  nodeSpawnDetached,
  type SelfUpdaterDeps,
} from './DmgSelfUpdater';

import type { ReleaseInfo } from '@domain/update/ReleaseInfo';

const release: ReleaseInfo = {
  version: unwrap(AppVersion.create('0.6.0')),
  downloadUrl: 'https://example.test/0.6.0.dmg',
  notesUrl: 'https://example.test/0.6.0',
};

const DMG_SHA256 = 'a'.repeat(64);

const verifiedRelease: ReleaseInfo = {
  ...release,
  checksumUrl: 'https://example.test/0.6.0.dmg.sha256',
};

const makeDeps = (over: Partial<SelfUpdaterDeps> = {}): SelfUpdaterDeps => ({
  download: vi.fn(async () => undefined),
  fetchText: vi.fn(async () => `${DMG_SHA256}  Inmemnote-macos-arm64.dmg\n`),
  sha256File: vi.fn(async () => DMG_SHA256),
  removeFile: vi.fn(async () => undefined),
  warn: vi.fn(),
  writeScript: vi.fn(async () => undefined),
  spawnDetached: vi.fn(async () => undefined),
  quit: vi.fn(),
  tmpDir: '/tmp/upd',
  pid: 4242,
  ...over,
});

describe('DmgSelfUpdater', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('downloads the DMG, writes the helper, spawns it detached, then quits', async () => {
    const deps = makeDeps();
    await new DmgSelfUpdater(deps).install(release);

    expect(deps.download).toHaveBeenCalledWith(
      release.downloadUrl,
      '/tmp/upd/Inmemnote-update.dmg',
      undefined,
    );
    expect(deps.writeScript).toHaveBeenCalledWith('/tmp/upd/inmemnote-update.sh', HELPER_SCRIPT);
    expect(deps.spawnDetached).toHaveBeenCalledWith('/bin/bash', [
      '/tmp/upd/inmemnote-update.sh',
      '4242',
      '/tmp/upd/Inmemnote-update.dmg',
    ]);
    expect(deps.quit).toHaveBeenCalledOnce();
  });

  it('quits only AFTER the helper is spawned (order matters)', async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      spawnDetached: vi.fn(async () => void calls.push('spawn')),
      quit: vi.fn(() => void calls.push('quit')),
    });
    await new DmgSelfUpdater(deps).install(release);
    expect(calls).toEqual(['spawn', 'quit']);
  });

  it('does NOT spawn or quit if the download fails', async () => {
    const deps = makeDeps({
      download: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    await expect(new DmgSelfUpdater(deps).install(release)).rejects.toThrow('network down');
    expect(deps.spawnDetached).not.toHaveBeenCalled();
    expect(deps.quit).not.toHaveBeenCalled();
  });

  it('helper waits on the PID before swapping the bundle', () => {
    // Guard the load-bearing ordering in the shell: kill -0 loop precedes the cp.
    const waitIdx = HELPER_SCRIPT.indexOf('kill -0');
    const copyIdx = HELPER_SCRIPT.indexOf('cp -R');
    expect(waitIdx).toBeGreaterThan(-1);
    expect(copyIdx).toBeGreaterThan(waitIdx);
    expect(HELPER_SCRIPT).toContain('com.apple.quarantine');
  });

  it('does NOT quit if the helper fails to start, and reports the failure', async () => {
    // Quitting without a live helper would close the app with nothing to
    // relaunch it; the rejection reaches the banner via InstallUpdateUseCase.
    const deps = makeDeps({
      spawnDetached: vi.fn(async () => {
        throw new Error('spawn /bin/bash EACCES');
      }),
    });
    await expect(new DmgSelfUpdater(deps).install(release)).rejects.toThrow('EACCES');
    expect(deps.quit).not.toHaveBeenCalled();
  });
});

describe('DmgSelfUpdater checksum verification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('installs when the DMG matches the published SHA-256', async () => {
    const deps = makeDeps();
    await new DmgSelfUpdater(deps).install(verifiedRelease);

    expect(deps.fetchText).toHaveBeenCalledWith(verifiedRelease.checksumUrl);
    expect(deps.sha256File).toHaveBeenCalledWith('/tmp/upd/Inmemnote-update.dmg');
    expect(deps.spawnDetached).toHaveBeenCalledOnce();
    expect(deps.quit).toHaveBeenCalledOnce();
    expect(deps.warn).not.toHaveBeenCalled();
  });

  it('fetches the checksum before spending time on the DMG download', async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      fetchText: vi.fn(async () => (calls.push('checksum'), DMG_SHA256)),
      download: vi.fn(async () => void calls.push('download')),
      sha256File: vi.fn(async () => (calls.push('hash'), DMG_SHA256)),
    });
    await new DmgSelfUpdater(deps).install(verifiedRelease);
    expect(calls).toEqual(['checksum', 'download', 'hash']);
  });

  it('accepts a bare, upper-case digest', async () => {
    const deps = makeDeps({ fetchText: vi.fn(async () => DMG_SHA256.toUpperCase()) });
    await new DmgSelfUpdater(deps).install(verifiedRelease);
    expect(deps.quit).toHaveBeenCalledOnce();
  });

  it('rejects a corrupted download, deletes it, and keeps the app running', async () => {
    const deps = makeDeps({ sha256File: vi.fn(async () => 'b'.repeat(64)) });

    await expect(new DmgSelfUpdater(deps).install(verifiedRelease)).rejects.toThrow(
      /checksum mismatch/i,
    );
    expect(deps.removeFile).toHaveBeenCalledWith('/tmp/upd/Inmemnote-update.dmg');
    expect(deps.writeScript).not.toHaveBeenCalled();
    expect(deps.spawnDetached).not.toHaveBeenCalled();
    expect(deps.quit).not.toHaveBeenCalled();
  });

  it('rejects a malformed checksum file without downloading the DMG', async () => {
    const deps = makeDeps({ fetchText: vi.fn(async () => '<html>Not Found</html>') });

    await expect(new DmgSelfUpdater(deps).install(verifiedRelease)).rejects.toThrow(/checksum/i);
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.quit).not.toHaveBeenCalled();
  });

  it('fails the install when a published checksum cannot be fetched', async () => {
    // The feed listed a checksum, so skipping it would silently drop the check.
    const deps = makeDeps({
      fetchText: vi.fn(async () => {
        throw new Error('Download failed: HTTP 503');
      }),
    });

    await expect(new DmgSelfUpdater(deps).install(verifiedRelease)).rejects.toThrow('503');
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.quit).not.toHaveBeenCalled();
  });

  it('installs a release without a checksum (≤ v0.6.0) but logs a warning', async () => {
    const deps = makeDeps();
    await new DmgSelfUpdater(deps).install(release);

    expect(deps.fetchText).not.toHaveBeenCalled();
    expect(deps.sha256File).not.toHaveBeenCalled();
    expect(deps.warn).toHaveBeenCalledWith(expect.stringMatching(/without.*checksum/i));
    expect(deps.quit).toHaveBeenCalledOnce();
  });
});

describe('nodeSha256File', () => {
  it('streams the file through SHA-256 and returns the hex digest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'inmemnote-sha-'));
    try {
      const file = join(dir, 'abc.bin');
      writeFileSync(file, 'abc');
      await expect(nodeSha256File(file)).resolves.toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('nodeSpawnDetached', () => {
  it('resolves once the child has actually started', async () => {
    await expect(nodeSpawnDetached('/bin/sh', ['-c', 'exit 0'])).resolves.toBeUndefined();
  });

  it("rejects when the child can't be started instead of failing silently", async () => {
    await expect(nodeSpawnDetached('/nonexistent/inmemnote-helper', [])).rejects.toThrow(/ENOENT/);
  });
});

// Each case spawns real bash + coreutils; allow for a loaded CI runner.
describe('HELPER_SCRIPT (run against a sandbox)', { timeout: 20_000 }, () => {
  let sb: ShellSandbox;
  let script: string;
  let dmg: string;

  beforeEach(() => {
    sb = createShellSandbox();
    script = join(sb.root, 'inmemnote-update.sh');
    writeFileSync(script, HELPER_SCRIPT, { mode: 0o755 });
    dmg = join(sb.root, 'update.dmg');
    mkdirSync(dmg);
    sb.makeBundle(sb.dest, 'old');
  });
  afterEach(() => sb.cleanup());

  const runHelper = (env?: Record<string, string>) =>
    sb.run(script, [deadPid(), dmg, sb.dest], env);

  it('swaps in the new bundle, leaves no staging/backup behind and relaunches it', () => {
    sb.makeBundle(dmg, 'new');
    const res = runHelper();

    expect(res.status, res.stderr).toBe(0);
    expect(sb.installedMarker()).toBe('new');
    expect(readdirSync(sb.dest)).toEqual(['Inmemnote.app']);
    expect(sb.opened()).toEqual([join(sb.dest, 'Inmemnote.app')]);
  });

  it('keeps the old app and relaunches it when copying the new bundle fails half-way', () => {
    const bundle = sb.makeBundle(dmg, 'new');
    writeFileSync(join(bundle, 'Contents', 'big.bin'), 'x');
    makeUnreadable(join(bundle, 'Contents', 'big.bin'));

    const res = runHelper();

    expect(res.status).not.toBe(0);
    expect(sb.installedMarker()).toBe('old');
    expect(readdirSync(sb.dest)).toEqual(['Inmemnote.app']);
    expect(sb.opened()).toEqual([join(sb.dest, 'Inmemnote.app')]);
  });

  it('keeps the old app and relaunches it when the DMG has no app bundle', () => {
    const res = runHelper();

    expect(res.status).not.toBe(0);
    expect(sb.installedMarker()).toBe('old');
    expect(readdirSync(sb.dest)).toEqual(['Inmemnote.app']);
    expect(sb.opened()).toEqual([join(sb.dest, 'Inmemnote.app')]);
  });

  it('restores the backup when moving the new bundle into place fails', () => {
    sb.makeBundle(dmg, 'new');
    const res = runHelper({ FAKE_MV_FAIL_SRC: '.Inmemnote.app.new-*' });

    expect(res.status).not.toBe(0);
    expect(sb.installedMarker()).toBe('old');
    expect(readdirSync(sb.dest)).toEqual(['Inmemnote.app']);
    expect(sb.opened()).toEqual([join(sb.dest, 'Inmemnote.app')]);
  });

  it('defaults the install directory to /Applications', () => {
    expect(HELPER_SCRIPT).toContain('dest="${3:-/Applications}"');
  });
});
