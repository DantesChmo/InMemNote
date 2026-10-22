import type { Note } from '@domain/note/Note';
import type { NoteId } from '@domain/note/NoteId';
import type { NoteListFilter, NoteRepository } from '@domain/note/NoteRepository';

/**
 * Test fake of `NoteRepository` for use-case specs (ADR 0007).
 *
 * Deliberately separate from the production `InMemoryNoteRepository`
 * fallback so application specs never reach into infrastructure. It must
 * honour the port's ordering contract (pinned first, then `updatedAt` DESC)
 * because use-case specs assert on it — keep it in step with the adapters.
 */
export class FakeNoteRepository implements NoteRepository {
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
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}
