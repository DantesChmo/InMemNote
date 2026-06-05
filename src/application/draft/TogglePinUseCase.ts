import { err, ok, type Result } from '@shared/Result';

import { DraftNotFoundError } from './errors';

import type { DraftId } from '@domain/draft/DraftId';
import type { DraftNote } from '@domain/draft/DraftNote';
import type { DraftRepository } from '@domain/draft/DraftRepository';
import type { Clock } from '@domain/shared/Clock';


/**
 * Toggle the pin flag on the current draft.
 *
 * The "always on top" behavior is the infrastructure layer's job — the
 * use-case only flips the domain flag and persists it. Whoever listens to
 * `DraftPinned`/`DraftUnpinned` events (the Electron BrowserWindow adapter)
 * reacts to the window state change.
 */
export class TogglePinUseCase {
  public constructor(
    private readonly repo: DraftRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(id: DraftId): Promise<Result<DraftNote, DraftNotFoundError>> {
    const note = await this.repo.findById(id);
    if (!note) return err(new DraftNotFoundError(id));

    const now = this.clock.now();
    if (note.pinned) note.unpin(now);
    else note.pin(now);

    await this.repo.save(note);
    return ok(note);
  }
}
