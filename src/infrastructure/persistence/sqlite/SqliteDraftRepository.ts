
import { DraftId } from '@domain/draft/DraftId';
import { DraftNote } from '@domain/draft/DraftNote';
import { NoteContent } from '@domain/draft/NoteContent';
import Database from 'better-sqlite3';

import type { DraftRepository } from '@domain/draft/DraftRepository';

/**
 * SQLite-backed `DraftRepository`.
 *
 * `better-sqlite3` is synchronous on purpose: it avoids a thread pool and is
 * faster than node's async drivers for the workloads we have here (single-user,
 * tiny rows, no concurrency). We still expose async methods because the port
 * is async — the abstraction must let us swap in network-backed implementations
 * later if needed.
 *
 * Schema migrations are inlined here for V1 (just one CREATE). Once we have
 * more than one version we'll move to a dedicated migrations file.
 */
export class SqliteDraftRepository implements DraftRepository {
  private readonly db: Database.Database;

  public constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS drafts (
        id          TEXT PRIMARY KEY,
        content     TEXT NOT NULL,
        pinned      INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts (updated_at DESC);
    `);
  }

  public async save(note: DraftNote): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO drafts (id, content, pinned, created_at, updated_at)
         VALUES (@id, @content, @pinned, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           content    = excluded.content,
           pinned     = excluded.pinned,
           updated_at = excluded.updated_at`,
      )
      .run({
        id: note.id,
        content: note.content.value,
        pinned: note.pinned ? 1 : 0,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      });
  }

  public async findById(id: DraftId): Promise<DraftNote | null> {
    const row = this.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as Row | undefined;
    return row ? rowToNote(row) : null;
  }

  public async findLatest(): Promise<DraftNote | null> {
    const row = this.db
      .prepare('SELECT * FROM drafts ORDER BY updated_at DESC LIMIT 1')
      .get() as Row | undefined;
    return row ? rowToNote(row) : null;
  }

  public async delete(id: DraftId): Promise<void> {
    this.db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
  }

  public close(): void {
    this.db.close();
  }
}

interface Row {
  id: string;
  content: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

/**
 * Reconstruct a `DraftNote` from a raw row.
 *
 * If the row violates an invariant (bad id, oversized content), we throw —
 * that means our schema and our domain rules disagree, which is a bug, not a
 * recoverable runtime situation.
 */
function rowToNote(row: Row): DraftNote {
  const idResult = DraftId.create(row.id);
  if (!idResult.ok) throw new Error(`Corrupted draft id in DB: ${row.id}`);
  const contentResult = NoteContent.create(row.content);
  if (!contentResult.ok) throw new Error(`Corrupted draft content for id ${row.id}`);
  return DraftNote.restore({
    id: idResult.value,
    content: contentResult.value,
    pinned: row.pinned !== 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}
