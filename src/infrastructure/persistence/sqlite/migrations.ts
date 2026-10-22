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
 * See docs/adr/0004-single-sqlite-connection-and-schema-migrations.md.
 */

export interface Migration {
  /** Schema version this migration produces. 1-based, contiguous. */
  readonly version: number;
  /** Short human-readable label, used in error messages. */
  readonly name: string;
  readonly up: (db: Database.Database) => void;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'baseline schema (drafts, notes, settings)',
    // Every statement is `IF NOT EXISTS` on purpose: files written by
    // v0.1–v0.6.0 already have these tables (created inline by the
    // repositories) but `user_version = 0`. This migration adopts them as-is,
    // and only fills in what's missing — e.g. `settings` on files that
    // predate it. The DDL is byte-for-byte what those versions ran.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS drafts (
          id          TEXT PRIMARY KEY,
          content     TEXT NOT NULL,
          pinned      INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts (updated_at DESC);

        CREATE TABLE IF NOT EXISTS notes (
          id          TEXT PRIMARY KEY,
          content     TEXT NOT NULL,
          pinned      INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes (pinned DESC, updated_at DESC);

        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
];

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
  assertContiguous(migrations);

  const latest = migrations.length;
  const current = readVersion(db);
  if (current > latest) {
    // Old code writing into a schema it doesn't know could silently corrupt
    // it (e.g. a downgrade after a column was added). Refuse; the caller falls
    // back to in-memory and the file stays intact for the newer app.
    throw new Error(
      `Database schema version ${current} is newer than this app supports (${latest}).`,
    );
  }

  for (const migration of migrations.slice(current)) {
    // IMMEDIATE takes the write lock before re-reading the version, so a
    // second app instance migrating the same file concurrently waits and then
    // skips the step instead of applying it twice.
    const step = db.transaction(() => {
      if (readVersion(db) >= migration.version) return;
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    try {
      step.immediate();
    } catch (e) {
      throw new Error(`Migration ${migration.version} (${migration.name}) failed.`, { cause: e });
    }
  }
}

function readVersion(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/** Versions must be exactly 1..N in order, so `slice(current)` is the pending tail. */
function assertContiguous(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Malformed migration list: expected version ${index + 1} at position ${index}, ` +
          `got ${migration.version} (${migration.name}).`,
      );
    }
  });
}
