
import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { InMemoryNoteRepository } from '@infrastructure/persistence/InMemoryNoteRepository';
import { FixedClock } from '@infrastructure/SystemClock';
import { describe, expect, it } from 'vitest';

import { NoteNotFoundError } from './errors';
import { UpdateNoteContentUseCase } from './UpdateNoteContentUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-01-01T00:01:00Z');

describe('UpdateNoteContentUseCase', () => {
  it('persists the new body and bumps updatedAt', async () => {
    const repo = new InMemoryNoteRepository();
    const note = Note.create(NoteContent.empty(), T0);
    await repo.save(note);

    const result = await new UpdateNoteContentUseCase(repo, new FixedClock(T1)).execute(
      note.id,
      'updated',
    );
    expect(result.ok).toBe(true);
    const reloaded = await repo.findById(note.id);
    expect(reloaded?.content.value).toBe('updated');
    expect(reloaded?.updatedAt).toEqual(T1);
  });

  it('errors out on a missing id', async () => {
    const repo = new InMemoryNoteRepository();
    const note = Note.create(NoteContent.empty(), T0);
    const result = await new UpdateNoteContentUseCase(repo, new FixedClock(T1)).execute(
      note.id,
      'x',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NoteNotFoundError);
  });

  it('rejects oversized content', async () => {
    const repo = new InMemoryNoteRepository();
    const note = Note.create(NoteContent.empty(), T0);
    await repo.save(note);
    const huge = 'x'.repeat(NoteContent.MAX_LENGTH + 1);
    const result = await new UpdateNoteContentUseCase(repo, new FixedClock(T1)).execute(
      note.id,
      huge,
    );
    expect(result.ok).toBe(false);
  });
});
