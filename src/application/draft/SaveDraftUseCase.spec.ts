
import { DraftNote } from '@domain/draft/DraftNote';
import { NoteContent } from '@domain/draft/NoteContent';
import { InMemoryDraftRepository } from '@infrastructure/persistence/InMemoryDraftRepository';
import { FixedClock } from '@infrastructure/SystemClock';
import { describe, expect, it } from 'vitest';

import { DraftNotFoundError } from './errors';
import { SaveDraftUseCase } from './SaveDraftUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-01-01T00:01:00Z');

describe('SaveDraftUseCase', () => {
  it('persists the new content and bumps updatedAt', async () => {
    const repo = new InMemoryDraftRepository();
    const draft = DraftNote.create(T0);
    await repo.save(draft);

    const clock = new FixedClock(T1);
    const useCase = new SaveDraftUseCase(repo, clock);
    const result = await useCase.execute(draft.id, 'fresh');

    expect(result.ok).toBe(true);
    const reloaded = await repo.findById(draft.id);
    expect(reloaded?.content.value).toBe('fresh');
    expect(reloaded?.updatedAt).toEqual(T1);
  });

  it('errors out when the draft does not exist', async () => {
    const repo = new InMemoryDraftRepository();
    const useCase = new SaveDraftUseCase(repo, new FixedClock(T0));
    const result = await useCase.execute(DraftNote.create(T0).id, 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(DraftNotFoundError);
  });

  it('rejects content exceeding the length cap', async () => {
    const repo = new InMemoryDraftRepository();
    const draft = DraftNote.create(T0);
    await repo.save(draft);

    const huge = 'a'.repeat(NoteContent.MAX_LENGTH + 1);
    const result = await new SaveDraftUseCase(repo, new FixedClock(T1)).execute(draft.id, huge);
    expect(result.ok).toBe(false);
  });
});
