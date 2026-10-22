// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createShellSandbox,
  makeDmgFile,
  makeUnreadable,
  type ShellSandbox,
} from '../src/test/shellSandbox';

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

  describe('SHA-256 verification', () => {
    let dmgFile: string;
    const sha256Of = (path: string) =>
      createHash('sha256').update(readFileSync(path)).digest('hex');

    beforeEach(() => {
      // A file-shaped image, so the script can checksum it like a real DMG.
      dmgFile = makeDmgFile(join(sb.root, 'fixture-file.dmg'), dmg);
      sb.makeBundle(sb.dest, 'old');
      sb.makeBundle(dmg, 'new');
    });

    const installFile = (env: Record<string, string>) => install({ FAKE_DMG: dmgFile, ...env });

    it('installs when the DMG matches the published checksum', () => {
      const res = installFile({
        FAKE_SHA256: `${sha256Of(dmgFile)}  Inmemnote-macos-arm64.dmg\n`,
      });

      expect(res.status, res.stderr).toBe(0);
      expect(sb.installedMarker()).toBe('new');
      expect(res.stderr).not.toMatch(/warning/i);
    });

    it('refuses a DMG whose checksum does not match and keeps the previous install', () => {
      const res = installFile({ FAKE_SHA256: `${'0'.repeat(64)}  Inmemnote-macos-arm64.dmg\n` });

      expect(res.status).not.toBe(0);
      expect(res.stderr).toMatch(/checksum/i);
      expect(sb.installedMarker()).toBe('old');
      expect(readdirSync(sb.dest)).toEqual(['Inmemnote.app']);
      expect(sb.opened()).toEqual([]);
    });

    it('refuses a malformed checksum file', () => {
      const res = installFile({ FAKE_SHA256: 'Not Found' });

      expect(res.status).not.toBe(0);
      expect(res.stderr).toMatch(/checksum/i);
      expect(sb.installedMarker()).toBe('old');
    });

    it('installs a release without a checksum (≤ v0.6.0) with a warning', () => {
      const res = installFile({});

      expect(res.status, res.stderr).toBe(0);
      expect(sb.installedMarker()).toBe('new');
      expect(res.stderr).toMatch(/warning.*checksum/i);
    });
  });
});
