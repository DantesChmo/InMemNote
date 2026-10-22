// @vitest-environment node
//
// Integration tests for the schema migration runner, against real SQLite
// files in a per-test temp directory (docs/TESTING.md).
//
// Coverage:
//   - the shipped MIGRATIONS list is well-formed;
//   - a fresh file ends at the latest version with the full baseline schema;
//   - a v0.6.0 file (tables present, user_version = 0) is adopted with no
//     data loss and stays readable through the repositories;
//   - a pre-settings file gets the missing `settings` table;
//   - only pending migrations run, in order; re-running is a no-op;
//   - a failing migration is rolled back together with its version bump;
//   - a file from a newer app version is refused and left untouched;
//   - malformed migration lists are rejected before anything is applied.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AppSettingsParse } from '@domain/settings/AppSettings';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MIGRATIONS, runMigrations, type Migration } from './migrations';
import { openDatabase } from './openDatabase';
import { SqliteDraftRepository } from './SqliteDraftRepository';
import { SqliteNoteRepository } from './SqliteNoteRepository';
import { SqliteSettingsRepository } from './SqliteSettingsRepository';

const LATEST = MIGRATIONS.length;

// Frozen copy of the DDL that v0.6.0 ran inline in each repository
// constructor. Deliberately NOT imported from migrations.ts: this is what is
// already on users' disks, and it must not drift with the code under test.
const V060_DRAFTS = `
  CREATE TABLE IF NOT EXISTS drafts (
    id          TEXT PRIMARY KEY,
    content     TEXT NOT NULL,
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts (updated_at DESC);
`;
const V060_NOTES = `
  CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    content     TEXT NOT NULL,
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes (pinned DESC, updated_at DESC);
`;
const V060_SETTINGS = `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const NOTE_A = '22222222-2222-4222-8222-222222222222';
const NOTE_B = '33333333-3333-4333-8333-333333333333';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inmemnote-migrations-'));
  file = join(dir, 'inmemnote.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Build a file exactly as v0.6.0 would have left it, with some user data. */
function seedV060(path: string, opts: { withSettings: boolean } = { withSettings: true }): void {
  const db = new Database(path);
  try {
    db.pragma('journal_mode = WAL');
    db.exec(V060_DRAFTS);
    db.exec(V060_NOTES);
    if (opts.withSettings) db.exec(V060_SETTINGS);

    db.prepare(
      `INSERT INTO drafts (id, content, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(DRAFT_ID, 'draft in progress', 1, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
    const insertNote = db.prepare(
      `INSERT INTO notes (id, content, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    );
    insertNote.run(NOTE_A, 'first note', 0, '2026-02-01T00:00:00.000Z', '2026-02-03T00:00:00.000Z');
    insertNote.run(
      NOTE_B,
      'pinned note',
      1,
      '2026-02-02T00:00:00.000Z',
      '2026-02-02T00:00:00.000Z',
    );
    if (opts.withSettings) {
      const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      insertSetting.run('themeMode', JSON.stringify('light'));
      insertSetting.run('language', JSON.stringify('ru'));
    }
  } finally {
    db.close();
  }
}

function userVersion(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}

function tableNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
      name: string;
    }>
  ).map((r) => r.name);
}

function indexNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{
      name: string;
    }>
  ).map((r) => r.name);
}

/** Test-only migration that creates a single empty table. */
function createTable(version: number, table: string): Migration {
  return { version, name: `create ${table}`, up: (db) => db.exec(`CREATE TABLE ${table} (x)`) };
}

describe('MIGRATIONS', () => {
  it('is a non-empty, contiguous 1..N sequence', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, i) => i + 1));
  });
});

describe('runMigrations — fresh database', () => {
  it('creates the baseline schema and stamps the latest version', () => {
    const db = new Database(file);
    try {
      runMigrations(db);

      expect(userVersion(db)).toBe(LATEST);
      expect(tableNames(db)).toEqual(expect.arrayContaining(['drafts', 'notes', 'settings']));
      expect(indexNames(db)).toEqual(
        expect.arrayContaining([
          'idx_drafts_updated_at',
          'idx_notes_updated_at',
          'idx_notes_pinned',
        ]),
      );
    } finally {
      db.close();
    }
  });

  it('is a no-op when run again on an up-to-date database', () => {
    const db = new Database(file);
    try {
      runMigrations(db);
      db.prepare("INSERT INTO settings (key, value) VALUES ('language', '\"en\"')").run();

      expect(() => runMigrations(db)).not.toThrow();
      expect(userVersion(db)).toBe(LATEST);
      expect(db.prepare('SELECT COUNT(*) AS c FROM settings').get()).toEqual({ c: 1 });
    } finally {
      db.close();
    }
  });
});

describe('runMigrations — adopting a v0.6.0 database (user_version = 0)', () => {
  it('upgrades in place without losing drafts, notes or settings', async () => {
    seedV060(file);

    const db = openDatabase(file);
    try {
      expect(userVersion(db)).toBe(LATEST);

      const draft = await new SqliteDraftRepository(db).findLatest();
      expect(draft?.id).toBe(DRAFT_ID);
      expect(draft?.content.value).toBe('draft in progress');
      expect(draft?.pinned).toBe(true);
      expect(draft?.updatedAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');

      const notes = await new SqliteNoteRepository(db).list('all');
      expect(notes.map((n) => [n.id, n.content.value, n.pinned])).toEqual([
        [NOTE_B, 'pinned note', true],
        [NOTE_A, 'first note', false],
      ]);

      const settings = await new SqliteSettingsRepository(db).load();
      expect(settings).not.toBeNull();
      expect(AppSettingsParse.toPlain(settings!)).toMatchObject({
        themeMode: 'light',
        language: 'ru',
      });
    } finally {
      db.close();
    }
  });

  it('keeps the upgraded database writable through the repositories', async () => {
    seedV060(file);

    const db = openDatabase(file);
    try {
      const notes = new SqliteNoteRepository(db);
      const [first] = await notes.list('all');
      await notes.delete(first!.id);
      expect((await notes.list('all')).map((n) => n.id)).toEqual([NOTE_A]);
    } finally {
      db.close();
    }
  });

  it('creates the `settings` table on a file that predates it, keeping existing notes', () => {
    seedV060(file, { withSettings: false });

    const db = openDatabase(file);
    try {
      expect(tableNames(db)).toContain('settings');
      expect(db.prepare('SELECT COUNT(*) AS c FROM notes').get()).toEqual({ c: 2 });
    } finally {
      db.close();
    }
  });

  it('survives a restart: reopening the upgraded file changes nothing', () => {
    seedV060(file);
    openDatabase(file).close();

    const db = openDatabase(file);
    try {
      expect(userVersion(db)).toBe(LATEST);
      expect(db.prepare('SELECT COUNT(*) AS c FROM notes').get()).toEqual({ c: 2 });
      expect(db.prepare('SELECT COUNT(*) AS c FROM drafts').get()).toEqual({ c: 1 });
    } finally {
      db.close();
    }
  });
});

describe('runMigrations — ordering and partial application', () => {
  it('applies only the migrations above the stored version, in order', () => {
    const applied: number[] = [];
    const track = (m: Migration): Migration => ({
      ...m,
      up: (db) => {
        applied.push(m.version);
        m.up(db);
      },
    });
    const list = [createTable(1, 'a'), createTable(2, 'b'), createTable(3, 'c')].map(track);

    const db = new Database(file);
    try {
      runMigrations(db, list.slice(0, 1));
      expect(applied).toEqual([1]);

      runMigrations(db, list);
      expect(applied).toEqual([1, 2, 3]);
      expect(userVersion(db)).toBe(3);
      expect(tableNames(db)).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    } finally {
      db.close();
    }
  });
});

describe('runMigrations — failure handling', () => {
  it('rolls back a failing migration together with its version bump', () => {
    const failing: Migration = {
      version: 2,
      name: 'half-done step',
      up: (db) => {
        db.exec('CREATE TABLE b (x)');
        throw new Error('boom');
      },
    };

    const db = new Database(file);
    try {
      expect(() => runMigrations(db, [createTable(1, 'a'), failing])).toThrow(/half-done step/);

      // Step 1 committed on its own; step 2 left no trace.
      expect(userVersion(db)).toBe(1);
      expect(tableNames(db)).toContain('a');
      expect(tableNames(db)).not.toContain('b');
    } finally {
      db.close();
    }
  });

  it('refuses a database written by a newer app version and leaves it untouched', () => {
    seedV060(file);
    const seeded = new Database(file);
    seeded.pragma(`user_version = ${LATEST + 1}`);
    seeded.close();

    const db = new Database(file);
    try {
      expect(() => runMigrations(db)).toThrow(/newer/i);
      expect(userVersion(db)).toBe(LATEST + 1);
      expect(db.prepare('SELECT COUNT(*) AS c FROM notes').get()).toEqual({ c: 2 });
    } finally {
      db.close();
    }
  });

  it.each([
    ['does not start at 1', [createTable(2, 'a')]],
    ['has a gap', [createTable(1, 'a'), createTable(3, 'c')]],
    ['has a duplicate version', [createTable(1, 'a'), createTable(1, 'b')]],
    ['is out of order', [createTable(2, 'b'), createTable(1, 'a')]],
  ])('rejects a migration list that %s, applying nothing', (_label, list) => {
    const db = new Database(file);
    try {
      expect(() => runMigrations(db, list)).toThrow(/migration/i);
      expect(userVersion(db)).toBe(0);
      expect(tableNames(db)).toEqual([]);
    } finally {
      db.close();
    }
  });
});
