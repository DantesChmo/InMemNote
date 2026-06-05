import type { DraftId } from './DraftId';
import type { DraftNote } from './DraftNote';

/**
 * Port for persisting drafts.
 *
 * The domain owns this interface; concrete implementations (SQLite, in-memory
 * for tests) live in infrastructure. Application use-cases depend on the port,
 * not on a concrete repo — that's the SOLID-D part.
 *
 * Method semantics:
 *   - `save` is upsert: a single call covers both first-write and updates.
 *     Use-cases shouldn't have to know whether the draft existed before.
 *   - `findById` returns `null` for "not found" (not a thrown error), because
 *     "not found" is an expected outcome in many flows.
 *   - `findLatest` returns the most-recently-updated draft, used to restore
 *     state when the Draft panel is reopened.
 */
export interface DraftRepository {
  save(note: DraftNote): Promise<void>;
  findById(id: DraftId): Promise<DraftNote | null>;
  findLatest(): Promise<DraftNote | null>;
  delete(id: DraftId): Promise<void>;
}
