import type { NoteId } from '@domain/note/NoteId';
import type { NoteRepository } from '@domain/note/NoteRepository';

/**
 * Delete a note. Idempotent — calling for a missing id is not an error,
 * because the library may have been mutated from another window between the
 * user's click and the IPC reaching main.
 */
export class DeleteNoteUseCase {
  public constructor(private readonly repo: NoteRepository) {}

  public async execute(id: NoteId): Promise<void> {
    await this.repo.delete(id);
  }
}
