// Regression tests for the in-memory note repository.
//
// Same intent as the draft variant: lock down the contract so a future
// refactor (e.g. moving the sort key, switching containers) cannot silently
// invert the pinned-first / recency-DESC ordering everyone downstream relies on.

import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { NoteId } from '@domain/note/NoteId';
import { unwrap } from '@shared/Result';
import { describe, expect, it } from 'vitest';

import { InMemoryNoteRepository } from './InMemoryNoteRepository';

function makeNote(opts: {
  id?: string;
  content?: string;
  pinned?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
} = {}): Note {
  return Note.restore({
    id: unwrap(NoteId.create(opts.id ?? '11111111-1111-4111-8111-111111111111')),
    content: unwrap(NoteContent.create(opts.content ?? 'body')),
    pinned: opts.pinned ?? false,
    createdAt: opts.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: opts.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
  });
}

describe('InMemoryNoteRepository', () => {
  it('list returns an empty array on an empty repo', async () => {
    const repo = new InMemoryNoteRepository();
    expect(await repo.list('all')).toEqual([]);
    expect(await repo.list('pinned')).toEqual([]);
  });

  it('save then findById returns the same instance', async () => {
    const repo = new InMemoryNoteRepository();
    const note = makeNote();
    await repo.save(note);
    expect(await repo.findById(note.id)).toBe(note);
  });

  it('findById returns null when the id is unknown', async () => {
    const repo = new InMemoryNoteRepository();
    const ghost = unwrap(NoteId.create('99999999-9999-4999-8999-999999999999'));
    expect(await repo.findById(ghost)).toBeNull();
  });

  it('save on the same id overwrites — last write wins', async () => {
    const repo = new InMemoryNoteRepository();
    const first = makeNote({ content: 'v1' });
    const second = makeNote({ id: first.id as unknown as string, content: 'v2' });
    await repo.save(first);
    await repo.save(second);
    expect((await repo.findById(first.id))?.content.value).toBe('v2');
  });

  describe('ordering', () => {
    it('list("all") puts pinned notes first, then sorts by updatedAt DESC within each group', async () => {
      const repo = new InMemoryNoteRepository();
      await repo.save(makeNote({
        id: '11111111-1111-4111-8111-111111111111',
        content: 'unpinned-old',
        pinned: false,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }));
      await repo.save(makeNote({
        id: '22222222-2222-4222-8222-222222222222',
        content: 'unpinned-new',
        pinned: false,
        updatedAt: new Date('2026-06-09T12:00:00.000Z'),
      }));
      await repo.save(makeNote({
        id: '33333333-3333-4333-8333-333333333333',
        content: 'pinned-old',
        pinned: true,
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      }));
      await repo.save(makeNote({
        id: '44444444-4444-4444-8444-444444444444',
        content: 'pinned-new',
        pinned: true,
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      }));

      expect((await repo.list('all')).map((n) => n.content.value)).toEqual([
        'pinned-new',
        'pinned-old',
        'unpinned-new',
        'unpinned-old',
      ]);
    });

    it('list("pinned") filters out unpinned notes and keeps recency DESC', async () => {
      const repo = new InMemoryNoteRepository();
      await repo.save(makeNote({
        id: '11111111-1111-4111-8111-111111111111',
        content: 'unpinned',
        pinned: false,
      }));
      await repo.save(makeNote({
        id: '22222222-2222-4222-8222-222222222222',
        content: 'pin-old',
        pinned: true,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }));
      await repo.save(makeNote({
        id: '33333333-3333-4333-8333-333333333333',
        content: 'pin-new',
        pinned: true,
        updatedAt: new Date('2026-06-09T12:00:00.000Z'),
      }));

      expect((await repo.list('pinned')).map((n) => n.content.value)).toEqual([
        'pin-new',
        'pin-old',
      ]);
    });
  });

  describe('search', () => {
    it('matches case-insensitively on any substring of content', async () => {
      const repo = new InMemoryNoteRepository();
      await repo.save(makeNote({ id: '11111111-1111-4111-8111-111111111111', content: 'Hello World' }));
      await repo.save(makeNote({ id: '22222222-2222-4222-8222-222222222222', content: 'unrelated' }));

      const hits = await repo.search('HELLO');
      expect(hits.map((n) => n.content.value)).toEqual(['Hello World']);
    });

    it('returns no hits for an empty repo', async () => {
      expect(await new InMemoryNoteRepository().search('x')).toEqual([]);
    });

    it('an empty query matches every note (substring of every string)', async () => {
      // Documents the current contract: callers that consider "no query" a
      // separate flow must guard upstream — the search method itself does not.
      const repo = new InMemoryNoteRepository();
      await repo.save(makeNote({ id: '11111111-1111-4111-8111-111111111111', content: 'A' }));
      await repo.save(makeNote({ id: '22222222-2222-4222-8222-222222222222', content: 'B' }));
      expect((await repo.search('')).map((n) => n.content.value).sort()).toEqual(['A', 'B']);
    });

    it('search results follow the same pinned-first, recency-DESC ordering as list', async () => {
      const repo = new InMemoryNoteRepository();
      await repo.save(makeNote({
        id: '11111111-1111-4111-8111-111111111111',
        content: 'find me old',
        pinned: false,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }));
      await repo.save(makeNote({
        id: '22222222-2222-4222-8222-222222222222',
        content: 'find me pinned',
        pinned: true,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }));
      await repo.save(makeNote({
        id: '33333333-3333-4333-8333-333333333333',
        content: 'find me new',
        pinned: false,
        updatedAt: new Date('2026-06-09T12:00:00.000Z'),
      }));

      expect((await repo.search('find me')).map((n) => n.content.value)).toEqual([
        'find me pinned',
        'find me new',
        'find me old',
      ]);
    });
  });

  describe('delete', () => {
    it('removes a note and leaves siblings intact', async () => {
      const repo = new InMemoryNoteRepository();
      await repo.save(makeNote({ id: '11111111-1111-4111-8111-111111111111', content: 'gone' }));
      await repo.save(makeNote({ id: '22222222-2222-4222-8222-222222222222', content: 'stays' }));

      await repo.delete(unwrap(NoteId.create('11111111-1111-4111-8111-111111111111')));

      expect((await repo.list('all')).map((n) => n.content.value)).toEqual(['stays']);
    });

    it('is a no-op for an unknown id', async () => {
      const repo = new InMemoryNoteRepository();
      const ghost = unwrap(NoteId.create('99999999-9999-4999-8999-999999999999'));
      await expect(repo.delete(ghost)).resolves.toBeUndefined();
    });
  });
});
