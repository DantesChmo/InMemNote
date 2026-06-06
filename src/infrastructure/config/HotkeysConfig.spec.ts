import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_HOTKEYS, loadHotkeys } from './HotkeysConfig';

/**
 * Integration-style tests against the real filesystem. Each spec stages tiny
 * YAML files in a fresh tmp dir so paths never collide and a failure doesn't
 * leak state into the next run.
 */
describe('loadHotkeys', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hotkeys-cfg-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writeFile = (name: string, content: string): string => {
    const p = join(dir, name);
    writeFileSync(p, content, 'utf-8');
    return p;
  };

  describe('format', () => {
    it('accepts a single-key string and uses it verbatim', () => {
      const defaults = writeFile('hotkeys.yaml', 'openDraft: F1\n');
      const result = loadHotkeys({ defaultsPath: defaults });
      expect(result.hotkeys.openDraft).toBe('F1');
      expect(result.source).toBe(defaults);
    });

    it('joins a sequence of tokens with `+`', () => {
      const defaults = writeFile(
        'hotkeys.yaml',
        'openDraft: [CommandOrControl, Shift, Space]\n',
      );
      const result = loadHotkeys({ defaultsPath: defaults });
      expect(result.hotkeys.openDraft).toBe('CommandOrControl+Shift+Space');
    });

    it('accepts the YAML block sequence syntax as well', () => {
      const defaults = writeFile(
        'hotkeys.yaml',
        ['openDraft:', '  - CommandOrControl', '  - Option', '  - N', ''].join('\n'),
      );
      const result = loadHotkeys({ defaultsPath: defaults });
      expect(result.hotkeys.openDraft).toBe('CommandOrControl+Option+N');
    });

    it('rejects an unknown key token and falls back to defaults', () => {
      const defaults = writeFile('hotkeys.yaml', 'openDraft: WindowsKey\n');
      const result = loadHotkeys({ defaultsPath: defaults });
      // Defaults file itself is broken → we fall further back to hard-coded.
      expect(result.hotkeys).toEqual(DEFAULT_HOTKEYS);
      expect(result.warning).toMatch(/Unknown key token/i);
    });

    it('rejects an empty sequence', () => {
      const userPath = writeFile('user.yaml', 'openDraft: []\n');
      const defaults = writeFile('hotkeys.yaml', 'openDraft: F1\n');
      const result = loadHotkeys({ defaultsPath: defaults, userOverridePath: userPath });
      expect(result.hotkeys).toEqual(DEFAULT_HOTKEYS);
      expect(result.warning).toMatch(/invalid/i);
    });
  });

  describe('precedence', () => {
    it('uses the defaults file when no override is given', () => {
      const defaults = writeFile('hotkeys.yaml', 'openDraft: [CommandOrControl, J]\n');
      const result = loadHotkeys({ defaultsPath: defaults });
      expect(result.hotkeys.openDraft).toBe('CommandOrControl+J');
      expect(result.source).toBe(defaults);
    });

    it('prefers a valid user override over the defaults', () => {
      const defaults = writeFile('hotkeys.yaml', 'openDraft: [CommandOrControl, J]\n');
      const userPath = writeFile(
        'user.yaml',
        'openDraft: [CommandOrControl, Option, N]\n',
      );
      const result = loadHotkeys({ defaultsPath: defaults, userOverridePath: userPath });
      expect(result.hotkeys.openDraft).toBe('CommandOrControl+Option+N');
      expect(result.source).toBe(userPath);
    });

    it('falls back to hard-coded defaults (NOT the defaults file) when the user override exists but is invalid', () => {
      // Present-but-broken override is a louder signal than a missing one;
      // we deliberately don't transparently retry the packaged defaults.
      const defaults = writeFile('hotkeys.yaml', 'openDraft: [CommandOrControl, J]\n');
      const userPath = writeFile('user.yaml', 'openDraft: : oops\n');
      const result = loadHotkeys({
        defaultsPath: defaults,
        userOverridePath: userPath,
      });
      expect(result.hotkeys).toEqual(DEFAULT_HOTKEYS);
      expect(result.source).toBeNull();
      expect(result.warning).toMatch(/invalid/i);
    });

    it('falls back when the user file violates the schema (unknown key in the object)', () => {
      const defaults = writeFile('hotkeys.yaml', 'openDraft: [CommandOrControl, J]\n');
      // `closeDraft` is not declared in the schema; strict mode rejects it.
      const userPath = writeFile(
        'user.yaml',
        'openDraft: [CommandOrControl, J]\ncloseDraft: Esc\n',
      );
      const result = loadHotkeys({ defaultsPath: defaults, userOverridePath: userPath });
      expect(result.hotkeys).toEqual(DEFAULT_HOTKEYS);
      expect(result.source).toBeNull();
      expect(result.warning).toMatch(/invalid/i);
    });

    it('ignores a missing user file silently and reads defaults', () => {
      const defaults = writeFile('hotkeys.yaml', 'openDraft: [CommandOrControl, J]\n');
      const userPath = join(dir, 'does-not-exist.yaml');
      const result = loadHotkeys({ defaultsPath: defaults, userOverridePath: userPath });
      expect(result.hotkeys.openDraft).toBe('CommandOrControl+J');
      expect(result.source).toBe(defaults);
      expect(result.warning).toBeUndefined();
    });

    it('falls back to hard-coded defaults when both files are missing', () => {
      const result = loadHotkeys({
        defaultsPath: join(dir, 'nope-defaults.yaml'),
        userOverridePath: join(dir, 'nope-user.yaml'),
      });
      expect(result.hotkeys).toEqual(DEFAULT_HOTKEYS);
      expect(result.source).toBeNull();
      expect(result.warning).toMatch(/defaults file unreadable/i);
    });
  });

  it('supports YAML comments', () => {
    const defaults = writeFile(
      'hotkeys.yaml',
      '# user-friendly comment\nopenDraft: [CommandOrControl, K]  # trailing too\n',
    );
    const result = loadHotkeys({ defaultsPath: defaults });
    expect(result.hotkeys.openDraft).toBe('CommandOrControl+K');
  });
});
