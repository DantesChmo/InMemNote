import { NoteContent, type NoteContentTooLargeError } from '@domain/draft/NoteContent';
import { err, ok, type Result } from '@shared/Result';

import { NoteNotFoundError } from './errors';

import type { Note } from '@domain/note/Note';
import type { NoteId } from '@domain/note/NoteId';
import type { NoteRepository } from '@domain/note/NoteRepository';
import type { Clock } from '@domain/shared/Clock';


/**
 * Persist a new body for an existing note. Used by the library editor's
 * 500ms debounced autosave.
 */
export class UpdateNoteContentUseCase {
  public constructor(
    private readonly repo: NoteRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    id: NoteId,
    rawContent: string,
  ): Promise<Result<Note, NoteContentTooLargeError | NoteNotFoundError>> {
    const contentResult = NoteContent.create(rawContent);
    if (!contentResult.ok) return err(contentResult.error);

    const note = await this.repo.findById(id);
    if (!note) return err(new NoteNotFoundError(id));

    note.changeContent(contentResult.value, this.clock.now());
    await this.repo.save(note);
    return ok(note);
  }
}
