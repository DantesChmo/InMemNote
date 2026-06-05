
import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { InMemoryNoteRepository } from '@infrastructure/persistence/InMemoryNoteRepository';
import { describe, expect, it } from 'vitest';

import { ListNotesUseCase } from './ListNotesUseCase';

const T = (sec: number) => new Date(`2026-01-01T00:00:${sec.toString().padStart(2, '0')}Z`);
const makeNote = (body: string, t: Date) => {
  const c = NoteContent.create(body);
  if (!c.ok) throw c.error;
  return Note.create(c.value, t);
};

describe('ListNotesUseCase', () => {
  it('returns notes pinned-first, recent-first within groups', async () => {
    const repo = new InMemoryNoteRepository();
    const a = makeNote('a', T(1));
    const b = makeNote('b', T(2));
    const c = makeNote('c', T(3));
    b.pin(T(4));
    await repo.save(a);
    await repo.save(b);
    await repo.save(c);

    const list = await new ListNotesUseCase(repo).execute('all');
    expect(list.map((n) => n.content.value)).toEqual(['b', 'c', 'a']);
  });

  it('filters to pinned only when asked', async () => {
    const repo = new InMemoryNoteRepository();
    const a = makeNote('a', T(1));
    const b = makeNote('b', T(2));
    b.pin(T(3));
    await repo.save(a);
    await repo.save(b);

    const list = await new ListNotesUseCase(repo).execute('pinned');
    expect(list).toHaveLength(1);
    expect(list[0]?.content.value).toBe('b');
  });
});
