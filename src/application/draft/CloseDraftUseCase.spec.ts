
import { DraftNote } from '@domain/draft/DraftNote';
import { NoteContent } from '@domain/draft/NoteContent';
import { InMemoryDraftRepository } from '@infrastructure/persistence/InMemoryDraftRepository';
import { describe, expect, it } from 'vitest';

import { CloseDraftUseCase } from './CloseDraftUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('CloseDraftUseCase', () => {
  it('deletes an empty draft so it does not linger in storage', async () => {
    const repo = new InMemoryDraftRepository();
    const draft = DraftNote.create(T0);
    await repo.save(draft);

    await new CloseDraftUseCase(repo).execute(draft.id);
    expect(await repo.findById(draft.id)).toBeNull();
  });

  it('preserves a non-empty draft on close', async () => {
    const repo = new InMemoryDraftRepository();
    const draft = DraftNote.create(T0);
    const content = NoteContent.create('keep me');
    if (!content.ok) throw content.error;
    draft.changeContent(content.value, T0);
    await repo.save(draft);

    await new CloseDraftUseCase(repo).execute(draft.id);
    expect(await repo.findById(draft.id)).not.toBeNull();
  });

  it('is idempotent for a non-existent id', async () => {
    const repo = new InMemoryDraftRepository();
    await expect(new CloseDraftUseCase(repo).execute(DraftNote.create(T0).id)).resolves.toBeUndefined();
  });
});
