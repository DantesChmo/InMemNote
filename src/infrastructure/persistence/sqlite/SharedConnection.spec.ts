// @vitest-environment node
//
// Integration tests for `SharedConnection`, against real SQLite files in a
// per-test temp directory (docs/TESTING.md).

import { existsSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openDatabase } from './openDatabase';
import { SharedConnection } from './SharedConnection';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inmemnote-conn-'));
  file = join(dir, 'inmemnote.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SharedConnection', () => {
  it('does not touch the file until the first get()', () => {
    new SharedConnection(file);
    expect(existsSync(file)).toBe(false);
  });

  it('opens once and hands every caller the same connection', () => {
    const open = vi.fn(openDatabase);
    const connection = new SharedConnection(file, open);

    const a = connection.get();
    const b = connection.get();

    expect(a).toBe(b);
    expect(open).toHaveBeenCalledTimes(1);
    connection.close();
  });

  it('remembers a failed open and rethrows it to every caller without retrying', () => {
    const open = vi.fn(() => {
      throw new Error('SQLITE_CANTOPEN');
    });
    const connection = new SharedConnection(file, open);

    expect(() => connection.get()).toThrow('SQLITE_CANTOPEN');
    expect(() => connection.get()).toThrow('SQLITE_CANTOPEN');
    expect(open).toHaveBeenCalledTimes(1);
  });

  describe('close()', () => {
    it('closes the connection, so a later write throws instead of vanishing', () => {
      const connection = new SharedConnection(file);
      const db = connection.get();

      connection.close();

      expect(db.open).toBe(false);
      expect(() => db.prepare('INSERT INTO notes (id) VALUES (?)').run('x')).toThrow(/not open/);
    });

    it('checkpoints the WAL into the main file', () => {
      const connection = new SharedConnection(file);
      connection
        .get()
        .prepare(
          `INSERT INTO notes (id, content, pinned, created_at, updated_at)
           VALUES ('n1', 'kept', 0, '2026-01-01', '2026-01-01')`,
        )
        .run();

      connection.close();

      // A clean close folds the WAL back and removes the side files.
      expect(existsSync(`${file}-wal`)).toBe(false);
      const reopened = openDatabase(file);
      try {
        expect(reopened.prepare('SELECT content FROM notes').pluck().get()).toBe('kept');
      } finally {
        reopened.close();
      }
    });

    it('is idempotent', () => {
      const connection = new SharedConnection(file);
      connection.get();

      connection.close();
      expect(() => connection.close()).not.toThrow();
    });

    it('is a no-op when the connection was never opened', () => {
      const open = vi.fn(openDatabase);
      const connection = new SharedConnection(file, open);

      connection.close();

      expect(open).not.toHaveBeenCalled();
      expect(existsSync(file)).toBe(false);
    });

    it('is a no-op after a failed open', () => {
      const connection = new SharedConnection(file, () => {
        throw new Error('SQLITE_CANTOPEN');
      });
      expect(() => connection.get()).toThrow();

      expect(() => connection.close()).not.toThrow();
    });
  });

  describe('checkFile()', () => {
    it('passes while the file is where it was opened', () => {
      const connection = new SharedConnection(file);
      connection.get();

      expect(() => connection.checkFile()).not.toThrow();
      connection.close();
    });

    it('throws once the file has been deleted', () => {
      const connection = new SharedConnection(file);
      connection.get();

      unlinkSync(file);

      expect(() => connection.checkFile()).toThrow(/deleted or replaced/);
      connection.close();
    });

    it('throws once the file has been replaced by another one', () => {
      const connection = new SharedConnection(file);
      connection.get();

      renameSync(file, join(dir, 'moved-away.db'));
      writeFileSync(file, '');

      expect(() => connection.checkFile()).toThrow(/deleted or replaced/);
      connection.close();
    });

    it('is a no-op before the connection is opened', () => {
      expect(() => new SharedConnection(file).checkFile()).not.toThrow();
    });
  });
});
