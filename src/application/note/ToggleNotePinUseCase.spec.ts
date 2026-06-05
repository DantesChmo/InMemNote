
import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { InMemoryNoteRepository } from '@infrastructure/persistence/InMemoryNoteRepository';
import { FixedClock } from '@infrastructure/SystemClock';
import { describe, expect, it } from 'vitest';

import { ToggleNotePinUseCase } from './ToggleNotePinUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('ToggleNotePinUseCase', () => {
  it('flips pin back and forth', async () => {
    const repo = new InMemoryNoteRepository();
    const note = Note.create(NoteContent.empty(), T0);
    await repo.save(note);

    const useCase = new ToggleNotePinUseCase(repo, new FixedClock(T0));
    let r = await useCase.execute(note.id);
    expect(r.ok && r.value.pinned).toBe(true);
    r = await useCase.execute(note.id);
    expect(r.ok && r.value.pinned).toBe(false);
  });
});
