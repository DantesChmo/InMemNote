
import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { NoteId } from '@domain/note/NoteId';
import Database from 'better-sqlite3';

import type { NoteListFilter, NoteRepository } from '@domain/note/NoteRepository';

/**
 * SQLite-backed `NoteRepository`.
 *
 * Lives in the same db file as `SqliteDraftRepository`. Tables are independent
 * — drafts is the single scratch slot, notes is the library. Promoting a
 * draft is a use-case (`PromoteDraftToNoteUseCase`), not a single SQL move.
 *
 * Search uses a simple `LIKE %q%` because the dataset is small (single user,
 * thousands of notes at most) and FTS5 adds a maintenance tax we don't need
 * yet. If perf becomes a problem we'll wrap the body in `notes_fts` later.
 */
export class SqliteNoteRepository implements NoteRepository {
  private readonly db: Database.Database;

  public constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id          TEXT PRIMARY KEY,
        content     TEXT NOT NULL,
        pinned      INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes (pinned DESC, updated_at DESC);
    `);
  }

  public async list(filter: NoteListFilter): Promise<readonly Note[]> {
    const sql =
      filter === 'pinned'
        ? 'SELECT * FROM notes WHERE pinned = 1 ORDER BY updated_at DESC'
        : 'SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC';
    const rows = this.db.prepare(sql).all() as Row[];
    return rows.map(rowToNote);
  }

  public async findById(id: NoteId): Promise<Note | null> {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Row | undefined;
    return row ? rowToNote(row) : null;
  }

  public async save(note: Note): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO notes (id, content, pinned, created_at, updated_at)
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

  public async delete(id: NoteId): Promise<void> {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  }

  public async search(query: string): Promise<readonly Note[]> {
    // `%` and `_` are wildcards in LIKE; escape them so they don't smuggle
    // wildcard behavior through user input.
    const escaped = query.replace(/[\\%_]/g, (ch) => '\\' + ch);
    const rows = this.db
      .prepare(
        `SELECT * FROM notes
         WHERE LOWER(content) LIKE LOWER(?) ESCAPE '\\'
         ORDER BY pinned DESC, updated_at DESC`,
      )
      .all(`%${escaped}%`) as Row[];
    return rows.map(rowToNote);
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

function rowToNote(row: Row): Note {
  const idResult = NoteId.create(row.id);
  if (!idResult.ok) throw new Error(`Corrupted note id in DB: ${row.id}`);
  const contentResult = NoteContent.create(row.content);
  if (!contentResult.ok) throw new Error(`Corrupted note content for id ${row.id}`);
  return Note.restore({
    id: idResult.value,
    content: contentResult.value,
    pinned: row.pinned !== 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}
