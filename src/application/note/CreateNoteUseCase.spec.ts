import { FakeNoteRepository } from '@test/fakes/FakeNoteRepository';
import { FixedClock } from '@test/fakes/FixedClock';
import { describe, expect, it } from 'vitest';

import { CreateNoteUseCase } from './CreateNoteUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('CreateNoteUseCase', () => {
  it('persists a fresh empty note', async () => {
    const repo = new FakeNoteRepository();
    const note = await new CreateNoteUseCase(repo, new FixedClock(T0)).execute();
    expect(note.content.isEmpty()).toBe(true);
    expect(note.createdAt).toEqual(T0);
    expect(await repo.findById(note.id)).not.toBeNull();
  });
});
