import type { DraftId } from '@domain/draft/DraftId';
import type { DraftNote } from '@domain/draft/DraftNote';
import type { DraftRepository } from '@domain/draft/DraftRepository';

/**
 * Test fake of `DraftRepository` for use-case specs (ADR 0007).
 *
 * Deliberately separate from the production `InMemoryDraftRepository`
 * fallback so application specs never reach into infrastructure. Behaviour
 * must follow the port contract: `findLatest` returns the most recently
 * updated draft.
 */
export class FakeDraftRepository implements DraftRepository {
  private readonly store = new Map<DraftId, DraftNote>();

  public async save(note: DraftNote): Promise<void> {
    this.store.set(note.id, note);
  }

  public async findById(id: DraftId): Promise<DraftNote | null> {
    return this.store.get(id) ?? null;
  }

  public async findLatest(): Promise<DraftNote | null> {
    let latest: DraftNote | null = null;
    for (const note of this.store.values()) {
      if (!latest || note.updatedAt > latest.updatedAt) latest = note;
    }
    return latest;
  }

  public async delete(id: DraftId): Promise<void> {
    this.store.delete(id);
  }
}
