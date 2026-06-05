import { DraftNotFoundError } from '@application/draft/errors';
import { Note } from '@domain/note/Note';
import { err, ok, type Result } from '@shared/Result';

import type { DraftId } from '@domain/draft/DraftId';
import type { DraftRepository } from '@domain/draft/DraftRepository';
import type { NoteRepository } from '@domain/note/NoteRepository';
import type { Clock } from '@domain/shared/Clock';


/**
 * Promote the current draft into a library note.
 *
 * Triggered when the user presses ⌘↵ in the Draft overlay. The draft is the
 * scratch buffer — once it gets promoted we wipe it from the drafts table so
 * the next ⌘⇧Space starts clean. Empty drafts are not promoted (we'd just be
 * filling the library with blank rows).
 *
 * Returns the new `Note`, so the renderer can update both windows (the Draft
 * panel hides, the Library — if open — refreshes its list).
 */
export class PromoteDraftToNoteUseCase {
  public constructor(
    private readonly drafts: DraftRepository,
    private readonly notes: NoteRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(draftId: DraftId): Promise<Result<Note | null, DraftNotFoundError>> {
    const draft = await this.drafts.findById(draftId);
    if (!draft) return err(new DraftNotFoundError(draftId));

    // Skip promotion for an empty buffer — but still clear the slot so the
    // next "open" starts with a brand-new draft.
    if (draft.content.isEmpty()) {
      await this.drafts.delete(draftId);
      return ok(null);
    }

    const note = Note.create(draft.content, this.clock.now());
    await this.notes.save(note);
    await this.drafts.delete(draftId);
    return ok(note);
  }
}
