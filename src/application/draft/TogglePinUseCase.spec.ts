
import { DraftNote } from '@domain/draft/DraftNote';
import { InMemoryDraftRepository } from '@infrastructure/persistence/InMemoryDraftRepository';
import { FixedClock } from '@infrastructure/SystemClock';
import { describe, expect, it } from 'vitest';

import { TogglePinUseCase } from './TogglePinUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('TogglePinUseCase', () => {
  it('flips the pin flag back and forth', async () => {
    const repo = new InMemoryDraftRepository();
    const draft = DraftNote.create(T0);
    await repo.save(draft);

    const useCase = new TogglePinUseCase(repo, new FixedClock(T0));
    let r = await useCase.execute(draft.id);
    expect(r.ok && r.value.pinned).toBe(true);

    r = await useCase.execute(draft.id);
    expect(r.ok && r.value.pinned).toBe(false);
  });
});
