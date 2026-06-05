
import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { InMemoryNoteRepository } from '@infrastructure/persistence/InMemoryNoteRepository';
import { describe, expect, it } from 'vitest';

import { DeleteNoteUseCase } from './DeleteNoteUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('DeleteNoteUseCase', () => {
  it('removes the note', async () => {
    const repo = new InMemoryNoteRepository();
    const note = Note.create(NoteContent.empty(), T0);
    await repo.save(note);
    await new DeleteNoteUseCase(repo).execute(note.id);
    expect(await repo.findById(note.id)).toBeNull();
  });

  it('is idempotent for a missing id', async () => {
    const repo = new InMemoryNoteRepository();
    const note = Note.create(NoteContent.empty(), T0);
    await expect(new DeleteNoteUseCase(repo).execute(note.id)).resolves.toBeUndefined();
  });
});
