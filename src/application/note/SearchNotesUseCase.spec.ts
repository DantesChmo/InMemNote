
import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { InMemoryNoteRepository } from '@infrastructure/persistence/InMemoryNoteRepository';
import { describe, expect, it } from 'vitest';

import { SearchNotesUseCase } from './SearchNotesUseCase';

const T0 = new Date('2026-01-01T00:00:00Z');

const make = (body: string) => {
  const c = NoteContent.create(body);
  if (!c.ok) throw c.error;
  return Note.create(c.value, T0);
};

describe('SearchNotesUseCase', () => {
  it('returns matching notes', async () => {
    const repo = new InMemoryNoteRepository();
    await repo.save(make('Buy coffee'));
    await repo.save(make('Vacation plans'));
    await repo.save(make('Coffee machine cleanup'));

    const list = await new SearchNotesUseCase(repo).execute('coffee');
    expect(list.map((n) => n.content.value).sort()).toEqual([
      'Buy coffee',
      'Coffee machine cleanup',
    ]);
  });

  it('treats whitespace-only query as "show all"', async () => {
    const repo = new InMemoryNoteRepository();
    await repo.save(make('a'));
    await repo.save(make('b'));
    const list = await new SearchNotesUseCase(repo).execute('   ');
    expect(list).toHaveLength(2);
  });
});
