import { DraftId } from '@domain/draft/DraftId';
import { DraftNote } from '@domain/draft/DraftNote';
import { FakeDraftRepository } from '@test/fakes/FakeDraftRepository';
import { FixedClock } from '@test/fakes/FixedClock';
import { describe, expect, it } from 'vitest';

import { TogglePinUseCase } from './TogglePinUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('TogglePinUseCase', () => {
  it('flips the pin flag back and forth', async () => {
    const repo = new FakeDraftRepository();
    const draft = DraftNote.create(T0);
    await repo.save(draft);

    const useCase = new TogglePinUseCase(repo, new FixedClock(T0));
    let r = await useCase.execute(draft.id);
    expect(r.ok && r.value.pinned).toBe(true);

    r = await useCase.execute(draft.id);
    expect(r.ok && r.value.pinned).toBe(false);
  });

  it('stamps the toggle with the injected clock', async () => {
    const repo = new FakeDraftRepository();
    const draft = DraftNote.create(T0);
    await repo.save(draft);
    const clock = new FixedClock(new Date('2026-01-01T00:05:00Z'));

    const r = await new TogglePinUseCase(repo, clock).execute(draft.id);

    expect(r.ok && r.value.updatedAt).toEqual(clock.now());
  });

  it('persists the new flag so the next summon sees it', async () => {
    const repo = new FakeDraftRepository();
    const draft = DraftNote.create(T0);
    await repo.save(draft);

    await new TogglePinUseCase(repo, new FixedClock(T0)).execute(draft.id);

    expect((await repo.findById(draft.id))?.pinned).toBe(true);
  });

  it('returns DRAFT_NOT_FOUND for an unknown id and creates nothing', async () => {
    const repo = new FakeDraftRepository();
    const missing = DraftId.generate();

    const r = await new TogglePinUseCase(repo, new FixedClock(T0)).execute(missing);

    expect(!r.ok && r.error.code).toBe('DRAFT_NOT_FOUND');
    expect(await repo.findById(missing)).toBeNull();
  });
});
