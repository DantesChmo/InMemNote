// @vitest-environment node
//
// Unit tests for SqliteSettingsRepository.
//
// Coverage:
//   - schema (key-value `settings` table);
//   - load empty → null (first-launch contract);
//   - happy-path round-trip;
//   - partial corruption tolerance: garbled JSON / wrong type in ONE row
//     should not poison the others — the affected field falls back to its
//     default;
//   - structurally invalid present field (e.g. unknown theme) → whole load
//     returns null and warns;
//   - unknown keys on disk are silently ignored (forward-compat);
//   - save() upserts all four canonical keys, idempotently;
//   - concurrent saves resolve to a self-consistent end-state.

import { AppSettingsParse } from '@domain/settings/AppSettings';
import { Hotkey } from '@domain/settings/Hotkey';
import { PaletteOverrides } from '@domain/settings/PaletteOverrides';
import { unwrap } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SqliteSettingsRepository } from './SqliteSettingsRepository';

import type Database from 'better-sqlite3';

function makeRepo() {
  return new SqliteSettingsRepository(':memory:');
}

function rawHandle(repo: SqliteSettingsRepository): Database.Database {
  return (repo as unknown as { db: Database.Database }).db;
}

function rawWrite(repo: SqliteSettingsRepository, key: string, value: string): void {
  rawHandle(repo)
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

function readRows(repo: SqliteSettingsRepository): Map<string, string> {
  const rows = rawHandle(repo).prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  return new Map(rows.map((r) => [r.key, r.value]));
}

describe('SqliteSettingsRepository — schema', () => {
  let repo: SqliteSettingsRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('creates the key-value `settings` table', () => {
    const cols = rawHandle(repo).prepare("PRAGMA table_info('settings')").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
    expect(byName.key).toMatchObject({ type: 'TEXT', pk: 1 });
    expect(byName.value).toMatchObject({ type: 'TEXT', notnull: 1 });
  });

  it('opening twice against the same file is safe (CREATE IF NOT EXISTS)', () => {
    const tmp = `/tmp/inmemnote-settings-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
    const a = new SqliteSettingsRepository(tmp);
    const b = new SqliteSettingsRepository(tmp);
    expect(() => rawHandle(b).prepare('SELECT * FROM settings').all()).not.toThrow();
    a.close();
    b.close();
  });
});

describe('SqliteSettingsRepository — load', () => {
  let repo: SqliteSettingsRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('returns null when the table is empty (first-launch path)', async () => {
    expect(await repo.load()).toBeNull();
  });

  it('round-trips a saved AppSettings', async () => {
    const palette = unwrap(PaletteOverrides.create({ accent: '#3f7d6b' }));
    const hotkey = unwrap(Hotkey.create('CommandOrControl+Shift+P'));
    const settings = unwrap(
      AppSettingsParse.fromPlain({
        themeMode: 'dark',
        language: 'ru',
        openDraftHotkey: hotkey.accelerator,
      }),
    ).withPalette(palette);

    await repo.save(settings);

    const back = await repo.load();
    expect(back?.themeMode).toBe('dark');
    expect(back?.language).toBe('ru');
    expect(back?.openDraftHotkey.accelerator).toBe('CommandOrControl+Shift+P');
    expect(back?.palette.get('accent')).toBe('#3f7d6b');
  });

  describe('partial corruption tolerance', () => {
    it('skips a row whose value is not valid JSON; other fields still load with defaults applied', async () => {
      // themeMode is invalid JSON, others absent → loader fills in defaults.
      rawWrite(repo, 'themeMode', '{not-json'); // safeJsonParse returns undefined → row skipped
      rawWrite(repo, 'language', JSON.stringify('ru'));

      const loaded = await repo.load();
      expect(loaded?.language).toBe('ru'); // valid row honored
      expect(loaded?.themeMode).toBe('system'); // default for the broken row
    });

    it('skips a row whose JSON has the wrong type for the field', async () => {
      // `themeMode` expects a string; storing a number means `assignField` does
      // nothing for that key, and the default ('system') wins.
      rawWrite(repo, 'themeMode', JSON.stringify(42));
      rawWrite(repo, 'language', JSON.stringify('en'));

      const loaded = await repo.load();
      expect(loaded?.themeMode).toBe('system');
      expect(loaded?.language).toBe('en');
    });

    it('skips palette when its JSON is a primitive (not an object at all)', async () => {
      // `assignField` requires `isStringRecord`; a bare string fails the
      // `typeof value === 'object'` check, so the row is dropped and the
      // default empty palette wins.
      rawWrite(repo, 'palette', JSON.stringify('not-an-object'));
      rawWrite(repo, 'language', JSON.stringify('en'));

      const loaded = await repo.load();
      expect(loaded?.palette.toJSON()).toEqual({});
    });

    it('rejects palette when its JSON is structurally an object-of-strings but a key is not a known palette token', async () => {
      // Arrays ARE objects with numeric-string keys whose values may be strings,
      // so `isStringRecord` accepts them. The failure lands deeper, at
      // `PaletteOverrides.create`, which rejects the unknown token. That makes
      // the *whole* load return null (the failure is structural, not a row-skip).
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        rawWrite(repo, 'palette', JSON.stringify(['#ff0000']));

        const loaded = await repo.load();
        expect(loaded).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Unknown palette token/));
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('skips palette when at least one value is not a string', async () => {
      // assignField requires *all* values to be strings — one number disqualifies the whole row.
      rawWrite(repo, 'palette', JSON.stringify({ accent: '#ff0000', 'accent-ink': 5 }));

      const loaded = await repo.load();
      expect(loaded?.palette.toJSON()).toEqual({});
    });

    it('ignores keys it does not recognize (forward-compatibility)', async () => {
      rawWrite(repo, 'futureKey', JSON.stringify('whatever'));
      rawWrite(repo, 'language', JSON.stringify('ru'));

      const loaded = await repo.load();
      expect(loaded?.language).toBe('ru');
    });
  });

  it('returns null and warns when a structurally invalid value passes parsing into the domain layer', async () => {
    // 'turbo' is a valid string but not a ThemeMode, so AppSettingsParse.fromPlain
    // returns Err → loader logs and returns null instead of crashing.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      rawWrite(repo, 'themeMode', JSON.stringify('turbo'));

      const loaded = await repo.load();
      expect(loaded).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Settings on disk failed validation/));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns null and warns when the hotkey on disk is malformed', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      rawWrite(repo, 'openDraftHotkey', JSON.stringify('NotARealKey'));

      expect(await repo.load()).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Settings on disk failed validation/));
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('SqliteSettingsRepository — save', () => {
  let repo: SqliteSettingsRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('writes exactly the four canonical keys, each as a JSON-encoded value', async () => {
    const settings = unwrap(AppSettingsParse.fromPlain({}));
    await repo.save(settings);

    const rows = readRows(repo);
    expect(new Set(rows.keys())).toEqual(new Set(['themeMode', 'language', 'palette', 'openDraftHotkey']));

    // Each row is JSON — parsing must not throw and must match the source field.
    expect(JSON.parse(rows.get('themeMode')!)).toBe(settings.themeMode);
    expect(JSON.parse(rows.get('language')!)).toBe(settings.language);
    expect(JSON.parse(rows.get('palette')!)).toEqual(settings.palette.toJSON());
    expect(JSON.parse(rows.get('openDraftHotkey')!)).toBe(settings.openDraftHotkey.accelerator);
  });

  it('is idempotent — saving twice does not duplicate rows', async () => {
    const settings = unwrap(AppSettingsParse.fromPlain({}));
    await repo.save(settings);
    await repo.save(settings);

    const { c } = rawHandle(repo).prepare('SELECT COUNT(*) AS c FROM settings').get() as { c: number };
    expect(c).toBe(4);
  });

  it('upsert overwrites the prior value for a key', async () => {
    await repo.save(unwrap(AppSettingsParse.fromPlain({ themeMode: 'dark' })));
    await repo.save(unwrap(AppSettingsParse.fromPlain({ themeMode: 'light' })));

    const loaded = await repo.load();
    expect(loaded?.themeMode).toBe('light');
  });

  it('save is transactional: the four upserts commit together (no partial state on read)', async () => {
    // We can't easily simulate a mid-transaction crash, but we can confirm the
    // entire 4-row write is present after `save` resolves — which is what the
    // transaction wrapper guarantees. The check verifies both presence and that
    // no extra rows were left from previous attempts.
    const settings = unwrap(AppSettingsParse.fromPlain({ themeMode: 'dark', language: 'ru' }));
    await repo.save(settings);

    const rows = readRows(repo);
    expect(rows.size).toBe(4);
    for (const k of ['themeMode', 'language', 'palette', 'openDraftHotkey']) {
      expect(rows.has(k)).toBe(true);
    }
  });
});

describe('SqliteSettingsRepository — concurrent writes', () => {
  it('many concurrent saves converge: row count stays at 4 and load() reads a coherent state', async () => {
    const repo = makeRepo();
    try {
      const variants = [
        unwrap(AppSettingsParse.fromPlain({ themeMode: 'dark', language: 'en' })),
        unwrap(AppSettingsParse.fromPlain({ themeMode: 'light', language: 'ru' })),
        unwrap(AppSettingsParse.fromPlain({ themeMode: 'system', language: 'system' })),
      ];

      const saves = Array.from({ length: 30 }, (_, i) => repo.save(variants[i % variants.length]!));
      await Promise.all(saves);

      const { c } = rawHandle(repo).prepare('SELECT COUNT(*) AS c FROM settings').get() as { c: number };
      expect(c).toBe(4);

      const loaded = await repo.load();
      // The exact final values depend on dispatch order, but load() must
      // succeed (the row set is consistent — every key has a valid JSON value).
      expect(loaded).not.toBeNull();
    } finally {
      repo.close();
    }
  });

  it('multi-connection: a save through one repo is visible to a second repo on the same file', async () => {
    const file = `/tmp/inmemnote-settings-multi-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
    const writer = new SqliteSettingsRepository(file);
    const reader = new SqliteSettingsRepository(file);
    try {
      await writer.save(unwrap(AppSettingsParse.fromPlain({ themeMode: 'dark', language: 'ru' })));

      const seen = await reader.load();
      expect(seen?.themeMode).toBe('dark');
      expect(seen?.language).toBe('ru');
    } finally {
      writer.close();
      reader.close();
    }
  });
});
