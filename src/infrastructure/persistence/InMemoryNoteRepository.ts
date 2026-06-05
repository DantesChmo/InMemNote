import type { Note } from '@domain/note/Note';
import type { NoteId } from '@domain/note/NoteId';
import type { NoteListFilter, NoteRepository } from '@domain/note/NoteRepository';

/**
 * In-memory `NoteRepository` — production fallback when SQLite is unavailable,
 * and the default in unit tests.
 *
 * Sorting is centralized in `applyOrdering` so all three read paths (list,
 * search, internal queries) agree.
 */
export class InMemoryNoteRepository implements NoteRepository {
  private readonly store = new Map<NoteId, Note>();

  public async list(filter: NoteListFilter): Promise<readonly Note[]> {
    const all = Array.from(this.store.values());
    const filtered = filter === 'pinned' ? all.filter((n) => n.pinned) : all;
    return applyOrdering(filtered);
  }

  public async findById(id: NoteId): Promise<Note | null> {
    return this.store.get(id) ?? null;
  }

  public async save(note: Note): Promise<void> {
    this.store.set(note.id, note);
  }

  public async delete(id: NoteId): Promise<void> {
    this.store.delete(id);
  }

  public async search(query: string): Promise<readonly Note[]> {
    const q = query.toLowerCase();
    const hits = Array.from(this.store.values()).filter((n) =>
      n.content.value.toLowerCase().includes(q),
    );
    return applyOrdering(hits);
  }
}

function applyOrdering(notes: Note[]): Note[] {
  return notes.sort((a, b) => {
    // Pinned items rise to the top; within each group sort by recency.
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}
