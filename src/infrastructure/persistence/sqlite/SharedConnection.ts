import { openDatabase } from './openDatabase';

import type Database from 'better-sqlite3';

/**
 * The process-wide connection to `inmemnote.db` (ADR 0004), plus the two
 * lifecycle duties nobody else can own (ADR 0008):
 *
 * - **Lazy, shared open.** The first `get()` opens and migrates the file;
 *   every later call gets the same handle. A failed open is remembered and
 *   rethrown to each caller, so every repository falls back with the same
 *   error instead of retrying.
 * - **Close on quit.** `close()` checkpoints the WAL and releases the file.
 *   Repositories keep their reference, so a write that arrives afterwards
 *   throws ("connection is not open") instead of vanishing.
 * - **File identity.** On POSIX an open handle keeps writing to a deleted
 *   or replaced file without any error, so the data is silently lost.
 *   `checkFile()` turns that into an error the write guard can report.
 */
export class SharedConnection {
  public constructor(
    private readonly path: string,
    private readonly open: (path: string) => Database.Database = openDatabase,
  ) {}

  /** The open connection. Throws the (remembered) open error if it failed. */
  public get(): Database.Database {
    throw new Error('not implemented');
  }

  /** Close the connection if it was opened. Idempotent. */
  public close(): void {
    throw new Error('not implemented');
  }

  /**
   * Throw if the file the connection was opened on is no longer at `path`
   * (deleted, or replaced by another file). No-op before a successful open.
   */
  public checkFile(): void {
    throw new Error('not implemented');
  }
}
