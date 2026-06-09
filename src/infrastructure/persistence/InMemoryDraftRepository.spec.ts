// Regression tests for the in-memory draft repository.
//
// The implementation is intentionally trivial — these tests exist so that an
// accidental change to the contract (e.g. swapping the Map for an array,
// breaking last-write-wins, mis-comparing dates in findLatest) fails loudly
// instead of leaking into use-case tests that depend on this fallback.
import { describe, expect, it } from 'vitest';

import { DraftId } from '@domain/draft/DraftId';
import { DraftNote } from '@domain/draft/DraftNote';
import { NoteContent } from '@domain/draft/NoteContent';
import { unwrap } from '@shared/Result';

import { InMemoryDraftRepository } from './InMemoryDraftRepository';

function makeDraft(opts: {
  id?: string;
  content?: string;
  pinned?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
} = {}): DraftNote {
  return DraftNote.restore({
    id: unwrap(DraftId.create(opts.id ?? '11111111-1111-4111-8111-111111111111')),
    content: unwrap(NoteContent.create(opts.content ?? '')),
    pinned: opts.pinned ?? false,
    createdAt: opts.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: opts.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
  });
}

describe('InMemoryDraftRepository', () => {
  it('findById returns null for an unknown id', async () => {
    const repo = new InMemoryDraftRepository();
    const ghost = unwrap(DraftId.create('99999999-9999-4999-8999-999999999999'));
    expect(await repo.findById(ghost)).toBeNull();
  });

  it('save then findById returns the same instance', async () => {
    const repo = new InMemoryDraftRepository();
    const draft = makeDraft({ content: 'x' });
    await repo.save(draft);
    expect(await repo.findById(draft.id)).toBe(draft);
  });

  it('save on the same id overwrites — last write wins', async () => {
    const repo = new InMemoryDraftRepository();
    const first = makeDraft({ content: 'v1' });
    const second = makeDraft({ id: first.id as unknown as string, content: 'v2' });

    await repo.save(first);
    await repo.save(second);

    expect((await repo.findById(first.id))?.content.value).toBe('v2');
  });

  it('findLatest returns null when empty', async () => {
    expect(await new InMemoryDraftRepository().findLatest()).toBeNull();
  });

  it('findLatest picks the draft with the largest updatedAt regardless of insertion order', async () => {
    const repo = new InMemoryDraftRepository();
    await repo.save(makeDraft({
      id: '11111111-1111-4111-8111-111111111111',
      content: 'old',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }));
    await repo.save(makeDraft({
      id: '22222222-2222-4222-8222-222222222222',
      content: 'newest',
      updatedAt: new Date('2026-06-09T12:00:00.000Z'),
    }));
    await repo.save(makeDraft({
      id: '33333333-3333-4333-8333-333333333333',
      content: 'middle',
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    }));

    expect((await repo.findLatest())?.content.value).toBe('newest');
  });

  it('findLatest keeps the first-seen draft when timestamps tie (strict > comparison)', async () => {
    const repo = new InMemoryDraftRepository();
    const same = new Date('2026-01-01T00:00:00.000Z');
    await repo.save(makeDraft({
      id: '11111111-1111-4111-8111-111111111111',
      content: 'first',
      updatedAt: same,
    }));
    await repo.save(makeDraft({
      id: '22222222-2222-4222-8222-222222222222',
      content: 'second',
      updatedAt: same,
    }));

    // Map preserves insertion order; the strict `>` in findLatest means a tie
    // does not replace the incumbent.
    expect((await repo.findLatest())?.content.value).toBe('first');
  });

  it('delete removes the draft', async () => {
    const repo = new InMemoryDraftRepository();
    const draft = makeDraft();
    await repo.save(draft);
    await repo.delete(draft.id);
    expect(await repo.findById(draft.id)).toBeNull();
  });

  it('delete is a no-op for an unknown id', async () => {
    const repo = new InMemoryDraftRepository();
    const ghost = unwrap(DraftId.create('99999999-9999-4999-8999-999999999999'));
    await expect(repo.delete(ghost)).resolves.toBeUndefined();
  });
});
