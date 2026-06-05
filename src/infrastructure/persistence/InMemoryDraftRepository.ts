import type { DraftId } from '@domain/draft/DraftId';
import type { DraftNote } from '@domain/draft/DraftNote';
import type { DraftRepository } from '@domain/draft/DraftRepository';

/**
 * In-memory `DraftRepository` — production code, not test-only.
 *
 * Used by tests and as a fallback if SQLite initialization fails (we'd rather
 * lose persistence across restarts than refuse to launch). All entries live in
 * a `Map`; iteration cost is fine because the user has at most a handful of
 * drafts during a session.
 */
export class InMemoryDraftRepository implements DraftRepository {
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
