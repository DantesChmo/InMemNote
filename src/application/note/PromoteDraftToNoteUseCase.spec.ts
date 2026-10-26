import { DraftId } from '@domain/draft/DraftId';
import { DraftNote } from '@domain/draft/DraftNote';
import { NoteContent } from '@domain/draft/NoteContent';
import { FakeDraftRepository } from '@test/fakes/FakeDraftRepository';
import { FakeNoteRepository } from '@test/fakes/FakeNoteRepository';
import { FixedClock } from '@test/fakes/FixedClock';
import { describe, expect, it } from 'vitest';

import { PromoteDraftToNoteUseCase } from './PromoteDraftToNoteUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-01-01T00:01:00Z');

describe('PromoteDraftToNoteUseCase', () => {
  it('moves a non-empty draft into the notes store and clears the draft', async () => {
    const drafts = new FakeDraftRepository();
    const notes = new FakeNoteRepository();
    const draft = DraftNote.create(T0);
    const next = NoteContent.create('keep this');
    if (!next.ok) throw next.error;
    draft.changeContent(next.value, T0);
    await drafts.save(draft);

    const useCase = new PromoteDraftToNoteUseCase(drafts, notes, new FixedClock(T1));
    const r = await useCase.execute(draft.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).not.toBeNull();
    expect(r.value?.content.value).toBe('keep this');
    expect(r.value?.createdAt).toEqual(T1);
    expect(await drafts.findById(draft.id)).toBeNull();
    const list = await notes.list('all');
    expect(list).toHaveLength(1);
  });

  it('returns null and clears the draft when the body is empty', async () => {
    const drafts = new FakeDraftRepository();
    const notes = new FakeNoteRepository();
    const draft = DraftNote.create(T0);
    await drafts.save(draft);

    const r = await new PromoteDraftToNoteUseCase(drafts, notes, new FixedClock(T1)).execute(
      draft.id,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeNull();
    expect(await drafts.findById(draft.id)).toBeNull();
    expect(await notes.list('all')).toHaveLength(0);
  });

  it('returns DRAFT_NOT_FOUND for an unknown draft and leaves the library untouched', async () => {
    const drafts = new FakeDraftRepository();
    const notes = new FakeNoteRepository();

    const r = await new PromoteDraftToNoteUseCase(drafts, notes, new FixedClock(T1)).execute(
      DraftId.generate(),
    );

    expect(!r.ok && r.error.code).toBe('DRAFT_NOT_FOUND');
    expect(await notes.list('all')).toHaveLength(0);
  });
});
