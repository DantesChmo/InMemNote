import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';

import type { NoteRepository } from '@domain/note/NoteRepository';
import type { Clock } from '@domain/shared/Clock';

/**
 * Create a new, empty note in the library.
 *
 * Triggered by the "New" toolbar button (⌘N). The note is persisted
 * immediately so the next list-load can render it, even before the user has
 * typed anything. An empty title is fine — `Note.title()` falls back to a
 * placeholder.
 */
export class CreateNoteUseCase {
  public constructor(
    private readonly repo: NoteRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(): Promise<Note> {
    const note = Note.create(NoteContent.empty(), this.clock.now());
    await this.repo.save(note);
    return note;
  }
}
