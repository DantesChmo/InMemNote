
import { InMemoryNoteRepository } from '@infrastructure/persistence/InMemoryNoteRepository';
import { FixedClock } from '@infrastructure/SystemClock';
import { describe, expect, it } from 'vitest';

import { CreateNoteUseCase } from './CreateNoteUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('CreateNoteUseCase', () => {
  it('persists a fresh empty note', async () => {
    const repo = new InMemoryNoteRepository();
    const note = await new CreateNoteUseCase(repo, new FixedClock(T0)).execute();
    expect(note.content.isEmpty()).toBe(true);
    expect(note.createdAt).toEqual(T0);
    expect(await repo.findById(note.id)).not.toBeNull();
  });
});
