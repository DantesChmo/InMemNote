import type { Note } from './Note';
import type { NoteId } from './NoteId';

/**
 * Filters supported by `list`.
 *
 * Kept narrow because every option here is something the UI sidebar exposes —
 * "all" and "pinned-only". Tags are out of scope for V2.
 */
export type NoteListFilter = 'all' | 'pinned';

/**
 * Port for the library notes store.
 *
 * Ordering contract: `list` and `search` return pinned items first, then
 * non-pinned, each group sorted by `updatedAt` descending. Putting the
 * ordering in the port (instead of the UI) means every implementation MUST
 * agree on it — UI never has to re-sort.
 */
export interface NoteRepository {
  list(filter: NoteListFilter): Promise<readonly Note[]>;
  findById(id: NoteId): Promise<Note | null>;
  save(note: Note): Promise<void>;
  delete(id: NoteId): Promise<void>;
  /** Case-insensitive substring search across the body. Empty query → list('all'). */
  search(query: string): Promise<readonly Note[]>;
}
