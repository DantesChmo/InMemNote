import { DraftNote } from '@domain/draft/DraftNote';

import type { DraftRepository } from '@domain/draft/DraftRepository';
import type { Clock } from '@domain/shared/Clock';

/**
 * Open the Draft panel.
 *
 * Two scenarios — collapsed into one use-case because the caller (the global
 * hotkey listener) doesn't know and shouldn't care which one applies:
 *   1. If a previous draft exists and is non-empty, resume it.
 *   2. Otherwise create a fresh, empty draft.
 *
 * The use-case does not persist on open — a brand-new empty draft is
 * meaningless until the user actually types something. Persistence happens
 * via `SaveDraftUseCase` once the autosave debounce fires.
 */
export class OpenDraftUseCase {
  public constructor(
    private readonly repo: DraftRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(): Promise<DraftNote> {
    const latest = await this.repo.findLatest();
    if (latest && !latest.content.isEmpty()) {
      // Pin is a runtime UI affordance, not a persistence concern. The
      // overlay always comes up un-pinned (Spotlight-like) so the user
      // doesn't see a stale pin indicator the moment they hit ⌘⇧Space.
      // The text content is what we want to resume — pin/unpin is a
      // gesture they'll repeat if they care.
      latest.unpin(this.clock.now());
      return latest;
    }
    return DraftNote.create(this.clock.now());
  }
}
