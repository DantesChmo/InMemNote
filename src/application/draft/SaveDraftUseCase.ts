import { NoteContent } from '@domain/draft/NoteContent';
import { err, ok, type Result } from '@shared/Result';

import { DraftNotFoundError } from './errors';

import type { DraftId } from '@domain/draft/DraftId';
import type { DraftNote } from '@domain/draft/DraftNote';
import type { DraftRepository } from '@domain/draft/DraftRepository';
import type { NoteContentTooLargeError } from '@domain/draft/NoteContent';
import type { Clock } from '@domain/shared/Clock';



/**
 * Persist a new revision of the draft.
 *
 * Called by the autosave loop (debounced 500ms) and by the explicit save
 * shortcut (`⌘↵`). The renderer hands us a raw string from the editor; we
 * convert it into a `NoteContent` value object before letting it near the
 * aggregate so the length invariant is enforced here, not in the UI.
 *
 * Returns the updated aggregate so the renderer can sync timestamps.
 */
export class SaveDraftUseCase {
  public constructor(
    private readonly repo: DraftRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    id: DraftId,
    rawContent: string,
  ): Promise<Result<DraftNote, NoteContentTooLargeError | DraftNotFoundError>> {
    const contentResult = NoteContent.create(rawContent);
    if (!contentResult.ok) return err(contentResult.error);

    const note = await this.repo.findById(id);
    if (!note) return err(new DraftNotFoundError(id));

    note.changeContent(contentResult.value, this.clock.now());
    await this.repo.save(note);
    return ok(note);
  }
}
