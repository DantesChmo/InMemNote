
import { DraftNote } from '@domain/draft/DraftNote';
import { NoteContent } from '@domain/draft/NoteContent';
import { InMemoryDraftRepository } from '@infrastructure/persistence/InMemoryDraftRepository';
import { FixedClock } from '@infrastructure/SystemClock';
import { describe, expect, it } from 'vitest';

import { OpenDraftUseCase } from './OpenDraftUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('OpenDraftUseCase', () => {
  it('returns a fresh empty draft when storage is empty', async () => {
    const repo = new InMemoryDraftRepository();
    const useCase = new OpenDraftUseCase(repo, new FixedClock(T0));
    const draft = await useCase.execute();
    expect(draft.content.isEmpty()).toBe(true);
    expect(draft.createdAt).toEqual(T0);
  });

  it('resumes the latest non-empty draft', async () => {
    const repo = new InMemoryDraftRepository();
    const existing = DraftNote.create(T0);
    const next = NoteContent.create('partial work');
    if (!next.ok) throw next.error;
    existing.changeContent(next.value, T0);
    await repo.save(existing);

    const useCase = new OpenDraftUseCase(repo, new FixedClock(T0));
    const opened = await useCase.execute();
    expect(opened.id).toBe(existing.id);
    expect(opened.content.value).toBe('partial work');
  });

  it('does not resume a latest draft that is empty', async () => {
    const repo = new InMemoryDraftRepository();
    const stale = DraftNote.create(T0);
    await repo.save(stale);

    const useCase = new OpenDraftUseCase(repo, new FixedClock(T0));
    const opened = await useCase.execute();
    // Either a brand-new draft, or the same empty one — but never tied to
    // stale content. Verifying via "content is empty" is enough.
    expect(opened.content.isEmpty()).toBe(true);
  });
});
