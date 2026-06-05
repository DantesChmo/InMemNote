import { err, ok, type Result } from '@shared/Result';

import { NoteNotFoundError } from './errors';

import type { Note } from '@domain/note/Note';
import type { NoteId } from '@domain/note/NoteId';
import type { NoteRepository } from '@domain/note/NoteRepository';
import type { Clock } from '@domain/shared/Clock';


export class ToggleNotePinUseCase {
  public constructor(
    private readonly repo: NoteRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(id: NoteId): Promise<Result<Note, NoteNotFoundError>> {
    const note = await this.repo.findById(id);
    if (!note) return err(new NoteNotFoundError(id));
    const now = this.clock.now();
    if (note.pinned) note.unpin(now);
    else note.pin(now);
    await this.repo.save(note);
    return ok(note);
  }
}
