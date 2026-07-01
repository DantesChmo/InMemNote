import { AppVersion } from '@domain/update/AppVersion';
import { unwrap } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module imports `app` from electron at load time; stub it so the module
// evaluates outside the Electron runtime. The unit under test uses injected
// deps, not the real factory, so the stub is never actually called.
vi.mock('electron', () => ({ app: { quit: vi.fn() } }));

import { DmgSelfUpdater, HELPER_SCRIPT, type SelfUpdaterDeps } from './DmgSelfUpdater';

import type { ReleaseInfo } from '@domain/update/ReleaseInfo';

const release: ReleaseInfo = {
  version: unwrap(AppVersion.create('0.6.0')),
  downloadUrl: 'https://example.test/0.6.0.dmg',
  notesUrl: 'https://example.test/0.6.0',
};

const makeDeps = (over: Partial<SelfUpdaterDeps> = {}): SelfUpdaterDeps => ({
  download: vi.fn(async () => undefined),
  writeScript: vi.fn(async () => undefined),
  spawnDetached: vi.fn(),
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
      spawnDetached: vi.fn(() => void calls.push('spawn')),
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
});
