import type { Note } from '@domain/note/Note';
import type { NoteListFilter, NoteRepository } from '@domain/note/NoteRepository';

/**
 * List the notes currently visible in the library sidebar selection.
 *
 * No business logic of its own — the repository already enforces the sort
 * order. The use-case exists to give the renderer a single, named entry point
 * for "show me the list" without exposing the repository directly.
 */
export class ListNotesUseCase {
  public constructor(private readonly repo: NoteRepository) {}

  public async execute(filter: NoteListFilter): Promise<readonly Note[]> {
    return this.repo.list(filter);
  }
}
