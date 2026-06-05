import type { DraftId } from '@domain/draft/DraftId';
import type { DraftRepository } from '@domain/draft/DraftRepository';

/**
 * Close the Draft panel.
 *
 * Closing is mostly a UI concern (hide the window), but the use-case enforces
 * one domain rule: if the draft is empty, discard it instead of keeping a
 * zombie row in storage. Real content survives untouched — closing never
 * deletes a non-empty draft.
 */
export class CloseDraftUseCase {
  public constructor(private readonly repo: DraftRepository) {}

  public async execute(id: DraftId): Promise<void> {
    const note = await this.repo.findById(id);
    if (!note) return; // already gone; idempotent
    if (note.content.isEmpty()) {
      await this.repo.delete(id);
    }
  }
}
