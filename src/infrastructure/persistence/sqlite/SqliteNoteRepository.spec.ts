// @vitest-environment node
//
// Unit tests for SqliteNoteRepository.
//
// Coverage:
//   - schema (table, columns, both indexes);
//   - INSERT / UPSERT semantics on `save`;
//   - list filter ('all' vs 'pinned') and ordering (pinned-first, then updated_at DESC);
//   - search: case-insensitive substring match + LIKE wildcard escaping;
//   - corrupted-row guards on read;
//   - concurrent writes (single id collapses to one row; many ids → many rows).

import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { NoteId } from '@domain/note/NoteId';
import { unwrap } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteNoteRepository } from './SqliteNoteRepository';

import type Database from 'better-sqlite3';

function makeRepo() {
  return new SqliteNoteRepository(':memory:');
}

function makeNote(opts: {
  id?: string;
  content?: string;
  pinned?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
} = {}): Note {
  return Note.restore({
    id: unwrap(NoteId.create(opts.id ?? '11111111-1111-4111-8111-111111111111')),
    content: unwrap(NoteContent.create(opts.content ?? 'note body')),
    pinned: opts.pinned ?? false,
    createdAt: opts.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: opts.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
  });
}

function rawHandle(repo: SqliteNoteRepository): Database.Database {
  return (repo as unknown as { db: Database.Database }).db;
}

describe('SqliteNoteRepository — schema', () => {
  let repo: SqliteNoteRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('creates the `notes` table with the expected columns', () => {
    const cols = rawHandle(repo).prepare("PRAGMA table_info('notes')").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
    expect(byName.id).toMatchObject({ type: 'TEXT', pk: 1 });
    expect(byName.content).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.pinned).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.created_at).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.updated_at).toMatchObject({ type: 'TEXT', notnull: 1 });
  });

  it('creates both indexes — by updated_at and by (pinned, updated_at)', () => {
    const names = (rawHandle(repo)
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'notes'")
      .all() as Array<{ name: string }>).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['idx_notes_updated_at', 'idx_notes_pinned']));
  });

  it('CREATE TABLE IF NOT EXISTS — opening a second instance against the same file is safe', () => {
    const tmp = `/tmp/inmemnote-notes-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
    const a = new SqliteNoteRepository(tmp);
    const b = new SqliteNoteRepository(tmp);
    expect(() => rawHandle(b).prepare('SELECT * FROM notes').all()).not.toThrow();
    a.close();
    b.close();
  });
});

describe('SqliteNoteRepository — save (INSERT / UPSERT)', () => {
  let repo: SqliteNoteRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('persists a fresh note with boolean encoded as 0/1', async () => {
    await repo.save(makeNote({ content: 'hello', pinned: true }));
    const row = rawHandle(repo).prepare('SELECT * FROM notes').get() as Record<string, unknown>;
    expect(row.content).toBe('hello');
    expect(row.pinned).toBe(1);
    expect(row.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('upserts on same id: content/pinned/updated_at overwritten, created_at preserved', async () => {
    const created = new Date('2026-01-01T00:00:00.000Z');
    await repo.save(makeNote({ content: 'v1', pinned: false, createdAt: created, updatedAt: created }));

    const later = new Date('2026-06-09T12:00:00.000Z');
    await repo.save(makeNote({
      content: 'v2',
      pinned: true,
      createdAt: new Date('2099-01-01T00:00:00.000Z'),
      updatedAt: later,
    }));

    const rows = rawHandle(repo).prepare('SELECT * FROM notes').all() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.content).toBe('v2');
    expect(rows[0]?.pinned).toBe(1);
    expect(rows[0]?.updated_at).toBe(later.toISOString());
    expect(rows[0]?.created_at).toBe(created.toISOString());
  });
});

describe('SqliteNoteRepository — read paths', () => {
  let repo: SqliteNoteRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('findById returns null for an unknown id', async () => {
    const ghost = unwrap(NoteId.create('99999999-9999-4999-8999-999999999999'));
    expect(await repo.findById(ghost)).toBeNull();
  });

  it('findById round-trips a saved note preserving every field', async () => {
    const id = unwrap(NoteId.create('11111111-1111-4111-8111-111111111111'));
    const created = new Date('2026-01-01T00:00:00.000Z');
    const updated = new Date('2026-06-09T12:00:00.000Z');
    await repo.save(makeNote({ content: 'X', pinned: true, createdAt: created, updatedAt: updated }));

    const back = await repo.findById(id);
    expect(back?.id).toBe(id);
    expect(back?.content.value).toBe('X');
    expect(back?.pinned).toBe(true);
    expect(back?.createdAt.toISOString()).toBe(created.toISOString());
    expect(back?.updatedAt.toISOString()).toBe(updated.toISOString());
  });

  it('list("all") returns pinned notes first, then by updated_at DESC', async () => {
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

    const list = await repo.list('all');
    expect(list.map((n) => n.content.value)).toEqual([
      'pinned-new',     // pinned, newer
      'pinned-old',     // pinned, older
      'unpinned-new',   // unpinned, newer
      'unpinned-old',   // unpinned, older
    ]);
  });

  it('list("pinned") returns only pinned notes, ordered by updated_at DESC', async () => {
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

    const pinned = await repo.list('pinned');
    expect(pinned.map((n) => n.content.value)).toEqual(['pin-new', 'pin-old']);
  });

  it('list returns an empty array when the DB has no notes', async () => {
    expect(await repo.list('all')).toEqual([]);
    expect(await repo.list('pinned')).toEqual([]);
  });
});

describe('SqliteNoteRepository — search', () => {
  let repo: SqliteNoteRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('matches case-insensitively on any substring of content', async () => {
    await repo.save(makeNote({ id: '11111111-1111-4111-8111-111111111111', content: 'Hello World' }));
    await repo.save(makeNote({ id: '22222222-2222-4222-8222-222222222222', content: 'unrelated' }));

    const hits = await repo.search('HELLO');
    expect(hits.map((n) => n.content.value)).toEqual(['Hello World']);
  });

  it('orders search results pinned-first, then updated_at DESC', async () => {
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

    const hits = await repo.search('find me');
    expect(hits.map((n) => n.content.value)).toEqual([
      'find me pinned',
      'find me new',
      'find me old',
    ]);
  });

  // The LIKE escape rules are part of the contract: `%` and `_` are SQL
  // wildcards, `\` is the escape character. Without escaping, a user typing
  // `%` would match every row and `_` would match any single char — both are
  // wrong. These tests pin that.
  it('treats a literal "%" in the query as the character "%", not a wildcard', async () => {
    await repo.save(makeNote({ id: '11111111-1111-4111-8111-111111111111', content: '50% off' }));
    await repo.save(makeNote({ id: '22222222-2222-4222-8222-222222222222', content: 'no percent here' }));

    expect((await repo.search('%')).map((n) => n.content.value)).toEqual(['50% off']);
    expect(await repo.search('xyz%')).toEqual([]);
  });

  it('treats a literal "_" as the character "_", not a single-char wildcard', async () => {
    await repo.save(makeNote({ id: '11111111-1111-4111-8111-111111111111', content: 'snake_case' }));
    await repo.save(makeNote({ id: '22222222-2222-4222-8222-222222222222', content: 'kebabcase' }));

    const underscoreHits = (await repo.search('_')).map((n) => n.content.value);
    expect(underscoreHits).toEqual(['snake_case']);
  });

  it('treats a literal "\\" as a character, not as the LIKE escape', async () => {
    await repo.save(makeNote({ id: '11111111-1111-4111-8111-111111111111', content: 'path\\to\\file' }));
    await repo.save(makeNote({ id: '22222222-2222-4222-8222-222222222222', content: 'unrelated' }));

    const hits = (await repo.search('\\')).map((n) => n.content.value);
    expect(hits).toEqual(['path\\to\\file']);
  });
});

describe('SqliteNoteRepository — delete', () => {
  let repo: SqliteNoteRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('removes a row by id and leaves others untouched', async () => {
    await repo.save(makeNote({ id: '11111111-1111-4111-8111-111111111111', content: 'gone' }));
    await repo.save(makeNote({ id: '22222222-2222-4222-8222-222222222222', content: 'stays' }));

    await repo.delete(unwrap(NoteId.create('11111111-1111-4111-8111-111111111111')));

    const remaining = (await repo.list('all')).map((n) => n.content.value);
    expect(remaining).toEqual(['stays']);
  });

  it('is a no-op for a missing id', async () => {
    const ghost = unwrap(NoteId.create('99999999-9999-4999-8999-999999999999'));
    await expect(repo.delete(ghost)).resolves.toBeUndefined();
  });
});

describe('SqliteNoteRepository — corruption guards', () => {
  let repo: SqliteNoteRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('list() throws when a row holds an invalid UUID', async () => {
    rawHandle(repo)
      .prepare(
        `INSERT INTO notes (id, content, pinned, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?)`,
      )
      .run('not-a-uuid', 'x', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

    await expect(repo.list('all')).rejects.toThrowError(/Corrupted note id/);
  });

  it('list() throws when a row holds oversized content', async () => {
    const oversized = 'a'.repeat(NoteContent.MAX_LENGTH + 1);
    rawHandle(repo)
      .prepare(
        `INSERT INTO notes (id, content, pinned, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?)`,
      )
      .run(
        '11111111-1111-4111-8111-111111111111',
        oversized,
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );

    await expect(repo.list('all')).rejects.toThrowError(/Corrupted note content/);
  });
});

describe('SqliteNoteRepository — concurrent writes', () => {
  it('N concurrent upserts on the same id collapse to a single row', async () => {
    const repo = makeRepo();
    try {
      const id = '11111111-1111-4111-8111-111111111111';
      const writes = Array.from({ length: 50 }, (_, i) =>
        repo.save(makeNote({ id, content: `v${i}` })),
      );

      await Promise.all(writes);

      const { c } = rawHandle(repo).prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number };
      expect(c).toBe(1);
    } finally {
      repo.close();
    }
  });

  it('N concurrent saves on distinct ids produce N rows', async () => {
    const repo = makeRepo();
    try {
      const count = 100;
      const writes = Array.from({ length: count }, (_, i) => {
        const id = `${i.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
        return repo.save(makeNote({ id, content: `n${i}` }));
      });

      await Promise.all(writes);

      const { c } = rawHandle(repo).prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number };
      expect(c).toBe(count);
    } finally {
      repo.close();
    }
  });
});
