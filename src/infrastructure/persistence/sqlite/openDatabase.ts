import Database from 'better-sqlite3';

import { MIGRATIONS, runMigrations, type Migration } from './migrations';

/**
 * Open the app's SQLite file and bring its schema up to date.
 *
 * This is the only place that creates a `better-sqlite3` connection: the
 * composition root opens one handle per process and passes it to every
 * SQLite repository, which therefore never set pragmas or run DDL themselves.
 *
 * Throws if the file can't be opened or migrated; the handle is closed before
 * rethrowing so a failed open doesn't leak a file descriptor or a WAL lock.
 */
export function openDatabase(
  path: string,
  migrations: readonly Migration[] = MIGRATIONS,
): Database.Database {
  const db = new Database(path);
  try {
    db.pragma('journal_mode = WAL');
    runMigrations(db, migrations);
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}
