import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { NoteId } from '@domain/note/NoteId';
import { FakeNoteRepository } from '@test/fakes/FakeNoteRepository';
import { describe, expect, it } from 'vitest';

import { FindNoteUseCase } from './FindNoteUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('FindNoteUseCase', () => {
  it('returns the stored note', async () => {
    const repo = new FakeNoteRepository();
    const note = Note.create(NoteContent.empty(), T0);
    await repo.save(note);

    expect(await new FindNoteUseCase(repo).execute(note.id)).toBe(note);
  });

  it('returns null, not an error, for an id that is gone', async () => {
    // Normal race: a note deleted in one window while the other still shows it.
    // The UI clears the editor pane on null, so this must not throw.
    const repo = new FakeNoteRepository();

    await expect(new FindNoteUseCase(repo).execute(NoteId.generate())).resolves.toBeNull();
  });
});
