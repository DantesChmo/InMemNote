import type Database from 'better-sqlite3';

/**
 * Schema migrations for `inmemnote.db`.
 *
 * The schema version lives in SQLite's own `PRAGMA user_version` (an integer
 * in the file header, 0 on a fresh or pre-migrations file). Migration N moves
 * the schema from version N-1 to N; the runner applies every migration above
 * the stored version, in order, each in its own transaction together with the
 * `user_version` bump — SQLite DDL is transactional, so a failing step leaves
 * both the schema and the version exactly as they were.
 *
 * Rules for whoever adds migration N+1:
 *   - Append only. A released migration is never edited or reordered: users'
 *     files already carry its version number.
 *   - A migration must work on a file at version N-1 and nothing else; the
 *     runner guarantees that precondition.
 *
 * See docs/adr/0002-single-sqlite-connection-and-schema-migrations.md.
 */

export interface Migration {
  /** Schema version this migration produces. 1-based, contiguous. */
  readonly version: number;
  /** Short human-readable label, used in error messages. */
  readonly name: string;
  readonly up: (db: Database.Database) => void;
}

export const MIGRATIONS: readonly Migration[] = [];

/**
 * Bring `db` up to the latest version in `migrations`.
 *
 * Throws if the list is malformed, if the file was written by a newer app
 * (its `user_version` is above the latest known one), or if a migration
 * fails — in which case that migration is rolled back.
 */
export function runMigrations(
  db: Database.Database,
  migrations: readonly Migration[] = MIGRATIONS,
): void {
  void db;
  void migrations;
  throw new Error('not implemented');
}
