// @vitest-environment node
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShellSandbox, makeUnreadable, type ShellSandbox } from '../src/test/shellSandbox';

const INSTALL_SH = resolve(__dirname, 'install.sh');

// Each case spawns real bash + coreutils; allow for a loaded CI runner.
describe('scripts/install.sh (run against a sandbox)', { timeout: 20_000 }, () => {
  let sb: ShellSandbox;
  let dmg: string;

  beforeEach(() => {
    sb = createShellSandbox();
    dmg = join(sb.root, 'fixture.dmg');
    mkdirSync(dmg);
  });
  afterEach(() => sb.cleanup());

  const install = (env: Record<string, string> = {}) =>
    sb.run(INSTALL_SH, [], { INMEMNOTE_INSTALL_DIR: sb.dest, FAKE_DMG: dmg, ...env });

  it('installs into an empty directory and launches the app', () => {
    sb.makeBundle(dmg, 'new');
    const res = install();

    expect(res.status, res.stderr).toBe(0);
    expect(sb.installedMarker()).toBe('new');
    expect(readdirSync(sb.dest)).toEqual(['Inmemnote.app']);
    expect(sb.opened()).toEqual([join(sb.dest, 'Inmemnote.app')]);
  });

  it('replaces a previous install without leaving staging/backup copies', () => {
    sb.makeBundle(sb.dest, 'old');
    sb.makeBundle(dmg, 'new');
    const res = install();

    expect(res.status, res.stderr).toBe(0);
    expect(sb.installedMarker()).toBe('new');
    expect(readdirSync(sb.dest)).toEqual(['Inmemnote.app']);
  });

  it('keeps the previous install when copying the new bundle fails half-way', () => {
    sb.makeBundle(sb.dest, 'old');
    const bundle = sb.makeBundle(dmg, 'new');
    writeFileSync(join(bundle, 'Contents', 'big.bin'), 'x');
    makeUnreadable(join(bundle, 'Contents', 'big.bin'));

    const res = install();

    expect(res.status).not.toBe(0);
    expect(sb.installedMarker()).toBe('old');
    expect(readdirSync(sb.dest)).toEqual(['Inmemnote.app']);
    expect(sb.opened()).toEqual([]);
  });

  it('restores the previous install when moving the new bundle into place fails', () => {
    sb.makeBundle(sb.dest, 'old');
    sb.makeBundle(dmg, 'new');
    const res = install({ FAKE_MV_FAIL_SRC: '.Inmemnote.app.new-*' });

    expect(res.status).not.toBe(0);
    expect(sb.installedMarker()).toBe('old');
    expect(readdirSync(sb.dest)).toEqual(['Inmemnote.app']);
    expect(sb.opened()).toEqual([]);
  });
});
