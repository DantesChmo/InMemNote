import { statSync, type Stats } from 'node:fs';

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
  private state:
    | { kind: 'unopened' }
    | { kind: 'open'; db: Database.Database; file: Stats | undefined }
    | { kind: 'failed'; error: unknown }
    | { kind: 'closed'; db: Database.Database } = { kind: 'unopened' };

  public constructor(
    private readonly path: string,
    private readonly open: (path: string) => Database.Database = openDatabase,
  ) {}

  /** The open connection. Throws the (remembered) open error if it failed. */
  public get(): Database.Database {
    if (this.state.kind === 'unopened') {
      try {
        const db = this.open(this.path);
        // `undefined` for a path with no file behind it (`:memory:`): there
        // is nothing to lose track of, so `checkFile()` has nothing to do.
        this.state = { kind: 'open', db, file: statSync(this.path, { throwIfNoEntry: false }) };
      } catch (error) {
        this.state = { kind: 'failed', error };
      }
    }
    if (this.state.kind === 'failed') throw this.state.error;
    // After `close()` the closed handle is still handed out: repositories
    // already hold it, and a write on it throws loudly (see class JSDoc).
    return this.state.db;
  }

  /** Close the connection if it was opened. Idempotent. */
  public close(): void {
    if (this.state.kind !== 'open') return;
    this.state.db.close();
    this.state = { kind: 'closed', db: this.state.db };
  }

  /**
   * Throw if the file the connection was opened on is no longer at `path`
   * (deleted, or replaced by another file). No-op before a successful open.
   */
  public checkFile(): void {
    if (this.state.kind !== 'open' || !this.state.file) return;
    const now = statSync(this.path, { throwIfNoEntry: false });
    if (!now || now.ino !== this.state.file.ino || now.dev !== this.state.file.dev) {
      throw new Error(`database file was deleted or replaced: ${this.path}`);
    }
  }
}
