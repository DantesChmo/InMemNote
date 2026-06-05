import type { Note } from '@domain/note/Note';
import type { NoteId } from '@domain/note/NoteId';
import type { NoteRepository } from '@domain/note/NoteRepository';

/**
 * Load a single note by id. Returns `null` (not an error) when missing —
 * matching the repository contract. The UI handles "missing" by clearing the
 * editor pane, which is a normal flow (race between a delete in one window
 * and a click in another).
 */
export class FindNoteUseCase {
  public constructor(private readonly repo: NoteRepository) {}

  public execute(id: NoteId): Promise<Note | null> {
    return this.repo.findById(id);
  }
}
