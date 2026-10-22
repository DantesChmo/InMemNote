// @vitest-environment node
//
// Integration tests for `openDatabase`, against real SQLite files in a
// per-test temp directory (docs/TESTING.md). The migration logic itself is
// covered by migrations.spec.ts; here we pin the connection contract the
// composition root relies on.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MIGRATIONS, type Migration } from './migrations';
import { openDatabase } from './openDatabase';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inmemnote-open-'));
  file = join(dir, 'inmemnote.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('opens the file in WAL journal mode', () => {
    const db = openDatabase(file);
    try {
      expect(String(db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal');
    } finally {
      db.close();
    }
  });

  it('returns a connection already migrated to the latest version', () => {
    const db = openDatabase(file);
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
    } finally {
      db.close();
    }
  });

  it('throws when the file cannot be opened', () => {
    expect(() => openDatabase(join(dir, 'missing-dir', 'inmemnote.db'))).toThrow();
  });

  it('throws when a migration fails, leaving the file at its previous version', () => {
    const failing: Migration = {
      version: 1,
      name: 'broken baseline',
      up: () => {
        throw new Error('boom');
      },
    };

    expect(() => openDatabase(file, [failing])).toThrow(/broken baseline/);

    // The failed open released the file: a fresh connection sees an
    // untouched, writable database.
    const db = new Database(file);
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(0);
      expect(() => db.exec('CREATE TABLE probe (x)')).not.toThrow();
    } finally {
      db.close();
    }
  });
});
