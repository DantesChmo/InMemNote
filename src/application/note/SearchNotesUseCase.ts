import type { Note } from '@domain/note/Note';
import type { NoteRepository } from '@domain/note/NoteRepository';

/**
 * Search by substring across note bodies.
 *
 * Empty/whitespace query is treated as "show all" — the search field's
 * onChange clears the filter the moment the user wipes the input, so the
 * happy path doesn't need a separate "reset" call.
 */
export class SearchNotesUseCase {
  public constructor(private readonly repo: NoteRepository) {}

  public async execute(query: string): Promise<readonly Note[]> {
    const trimmed = query.trim();
    if (!trimmed) return this.repo.list('all');
    return this.repo.search(trimmed);
  }
}
