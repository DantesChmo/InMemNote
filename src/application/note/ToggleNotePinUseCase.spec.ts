import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { NoteId } from '@domain/note/NoteId';
import { FakeNoteRepository } from '@test/fakes/FakeNoteRepository';
import { FixedClock } from '@test/fakes/FixedClock';
import { describe, expect, it } from 'vitest';

import { ToggleNotePinUseCase } from './ToggleNotePinUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('ToggleNotePinUseCase', () => {
  it('flips pin back and forth', async () => {
    const repo = new FakeNoteRepository();
    const note = Note.create(NoteContent.empty(), T0);
    await repo.save(note);

    const useCase = new ToggleNotePinUseCase(repo, new FixedClock(T0));
    let r = await useCase.execute(note.id);
    expect(r.ok && r.value.pinned).toBe(true);
    r = await useCase.execute(note.id);
    expect(r.ok && r.value.pinned).toBe(false);
  });

  it('persists the flag so the Library list reorders pinned-first', async () => {
    const repo = new FakeNoteRepository();
    const older = Note.create(NoteContent.empty(), T0);
    const newer = Note.create(NoteContent.empty(), new Date('2026-01-01T00:01:00Z'));
    await repo.save(older);
    await repo.save(newer);

    await new ToggleNotePinUseCase(repo, new FixedClock(new Date('2026-01-01T00:02:00Z'))).execute(
      older.id,
    );

    const ids = (await repo.list('all')).map((n) => n.id);
    expect(ids).toEqual([older.id, newer.id]);
  });

  it('returns NOTE_NOT_FOUND for an unknown id and creates nothing', async () => {
    const repo = new FakeNoteRepository();
    const missing = NoteId.generate();

    const r = await new ToggleNotePinUseCase(repo, new FixedClock(T0)).execute(missing);

    expect(!r.ok && r.error.code).toBe('NOTE_NOT_FOUND');
    expect(await repo.list('all')).toHaveLength(0);
  });
});
