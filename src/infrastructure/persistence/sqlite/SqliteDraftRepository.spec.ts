// @vitest-environment node
//
// Unit tests for SqliteDraftRepository.
//
// We open against `:memory:` so each test gets a pristine database and the
// suite stays hermetic — no temp files, no leftover WAL journals.
//
// Topics covered (per request):
//   - schema creation (table, columns, index, WAL pragma);
//   - INSERT vs UPSERT semantics on `save`;
//   - update correctness (`updated_at` advances, `created_at` is preserved);
//   - data validation (`rowToNote` rejects corrupted rows);
//   - business logic (`findLatest`, `delete`);
//   - concurrent writes — better-sqlite3 is synchronous so the "race" here is
//     about ordering of awaited Promises producing a well-defined final state.

import { DraftId } from '@domain/draft/DraftId';
import { DraftNote } from '@domain/draft/DraftNote';
import { NoteContent } from '@domain/draft/NoteContent';
import { unwrap } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteDraftRepository } from './SqliteDraftRepository';

import type Database from 'better-sqlite3';

function makeRepo() {
  return new SqliteDraftRepository(':memory:');
}

function makeDraft(opts: {
  id?: string;
  content?: string;
  pinned?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
} = {}): DraftNote {
  // `restore` skips event emission and lets us set every field deterministically.
  return DraftNote.restore({
    id: unwrap(DraftId.create(opts.id ?? '11111111-1111-4111-8111-111111111111')),
    content: unwrap(NoteContent.create(opts.content ?? '')),
    pinned: opts.pinned ?? false,
    createdAt: opts.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: opts.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
  });
}

// Open a parallel read-only handle on the same db so we can inspect the raw
// rows without going through the repo's typed API.
function rawHandle(repo: SqliteDraftRepository): Database.Database {
  return (repo as unknown as { db: Database.Database }).db;
}

describe('SqliteDraftRepository — schema', () => {
  let repo: SqliteDraftRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('creates the `drafts` table with the expected columns', () => {
    const cols = rawHandle(repo).prepare("PRAGMA table_info('drafts')").all() as Array<{
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

  it('creates the updated_at index', () => {
    const indexes = rawHandle(repo)
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'drafts'")
      .all() as Array<{ name: string }>;
    expect(indexes.some((i) => i.name === 'idx_drafts_updated_at')).toBe(true);
  });

  it('opens the database in WAL journal mode', () => {
    const mode = rawHandle(repo).pragma('journal_mode', { simple: true });
    // `:memory:` databases force `memory` mode regardless of the requested
    // `WAL`. The point of the assertion is that the pragma is at least *applied
    // without throwing* — meaning the constructor wired it up.
    expect(['wal', 'memory']).toContain(String(mode).toLowerCase());
  });

  it('CREATE TABLE IF NOT EXISTS is idempotent — a second instance against the same db reuses the table', () => {
    // Mimic two separate repo instances pointing at the same file by opening a
    // second one against a shared file path.
    const tmp = `/tmp/inmemnote-draft-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
    const a = new SqliteDraftRepository(tmp);
    const b = new SqliteDraftRepository(tmp);
    expect(() => rawHandle(b).prepare('SELECT * FROM drafts').all()).not.toThrow();
    a.close();
    b.close();
  });
});

describe('SqliteDraftRepository — save (INSERT / UPSERT)', () => {
  let repo: SqliteDraftRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('persists a fresh draft as a new row with the boolean encoded as 0/1', async () => {
    await repo.save(makeDraft({ content: 'hello', pinned: true }));

    const row = rawHandle(repo).prepare('SELECT * FROM drafts').get() as Record<string, unknown>;
    expect(row.content).toBe('hello');
    expect(row.pinned).toBe(1);
    expect(row.created_at).toBe('2026-01-01T00:00:00.000Z');
    expect(row.updated_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('stores `pinned=false` as 0', async () => {
    await repo.save(makeDraft({ pinned: false }));
    const row = rawHandle(repo).prepare('SELECT pinned FROM drafts').get() as { pinned: number };
    expect(row.pinned).toBe(0);
  });

  it('upserts on the same id: content / pinned / updated_at are overwritten, created_at is preserved', async () => {
    const created = new Date('2026-01-01T00:00:00.000Z');
    await repo.save(makeDraft({
      content: 'v1',
      pinned: false,
      createdAt: created,
      updatedAt: created,
    }));

    const later = new Date('2026-06-09T12:00:00.000Z');
    await repo.save(makeDraft({
      content: 'v2',
      pinned: true,
      createdAt: new Date('2099-01-01T00:00:00.000Z'), // attempt to overwrite
      updatedAt: later,
    }));

    const rows = rawHandle(repo).prepare('SELECT * FROM drafts').all() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.content).toBe('v2');
    expect(rows[0]?.pinned).toBe(1);
    expect(rows[0]?.updated_at).toBe(later.toISOString());
    // The ON CONFLICT clause deliberately does NOT touch created_at — verifies
    // we don't accidentally re-stamp creation time on every save.
    expect(rows[0]?.created_at).toBe(created.toISOString());
  });

  it('multiple distinct ids produce independent rows', async () => {
    await repo.save(makeDraft({ id: '11111111-1111-4111-8111-111111111111', content: 'A' }));
    await repo.save(makeDraft({ id: '22222222-2222-4222-8222-222222222222', content: 'B' }));

    const rows = rawHandle(repo).prepare('SELECT id, content FROM drafts ORDER BY id').all();
    expect(rows).toEqual([
      { id: '11111111-1111-4111-8111-111111111111', content: 'A' },
      { id: '22222222-2222-4222-8222-222222222222', content: 'B' },
    ]);
  });
});

describe('SqliteDraftRepository — read paths', () => {
  let repo: SqliteDraftRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('findById returns null when the id is unknown', async () => {
    const missing = unwrap(DraftId.create('99999999-9999-4999-8999-999999999999'));
    expect(await repo.findById(missing)).toBeNull();
  });

  it('findById round-trips a saved draft preserving every field', async () => {
    const id = unwrap(DraftId.create('11111111-1111-4111-8111-111111111111'));
    const created = new Date('2026-01-01T00:00:00.000Z');
    const updated = new Date('2026-06-09T12:00:00.000Z');

    await repo.save(makeDraft({ content: 'round-trip', pinned: true, createdAt: created, updatedAt: updated }));

    const back = await repo.findById(id);
    expect(back).not.toBeNull();
    expect(back?.id).toBe(id);
    expect(back?.content.value).toBe('round-trip');
    expect(back?.pinned).toBe(true);
    expect(back?.createdAt.toISOString()).toBe(created.toISOString());
    expect(back?.updatedAt.toISOString()).toBe(updated.toISOString());
  });

  it('findLatest returns null when there are no drafts', async () => {
    expect(await repo.findLatest()).toBeNull();
  });

  it('findLatest returns the draft with the most recent updated_at, regardless of insertion order', async () => {
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

    const latest = await repo.findLatest();
    expect(latest?.content.value).toBe('newest');
  });
});

describe('SqliteDraftRepository — delete', () => {
  let repo: SqliteDraftRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('removes the row by id', async () => {
    const id = unwrap(DraftId.create('11111111-1111-4111-8111-111111111111'));
    await repo.save(makeDraft({ content: 'x' }));
    await repo.delete(id);
    expect(await repo.findById(id)).toBeNull();
  });

  it('is a silent no-op when the id is not present', async () => {
    const ghost = unwrap(DraftId.create('99999999-9999-4999-8999-999999999999'));
    await expect(repo.delete(ghost)).resolves.toBeUndefined();
  });

  it('only deletes the matching row', async () => {
    await repo.save(makeDraft({ id: '11111111-1111-4111-8111-111111111111', content: 'A' }));
    await repo.save(makeDraft({ id: '22222222-2222-4222-8222-222222222222', content: 'B' }));

    await repo.delete(unwrap(DraftId.create('11111111-1111-4111-8111-111111111111')));

    const survivors = rawHandle(repo).prepare('SELECT content FROM drafts').all();
    expect(survivors).toEqual([{ content: 'B' }]);
  });
});

describe('SqliteDraftRepository — corruption guards', () => {
  let repo: SqliteDraftRepository;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { repo.close(); });

  it('findById throws when the stored id is not a valid UUID v4', async () => {
    // Bypass the repo to write a row that violates the domain invariant.
    rawHandle(repo)
      .prepare(
        `INSERT INTO drafts (id, content, pinned, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?)`,
      )
      .run('not-a-uuid', 'x', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

    // We can't use repo.findById with the bad id (it would fail at the brand
    // creation site in our test code), so probe findLatest, which still picks
    // the row.
    await expect(repo.findLatest()).rejects.toThrowError(/Corrupted draft id/);
  });

  it('findLatest throws when the stored content exceeds the domain cap', async () => {
    // Insert a row with `length > NoteContent.MAX_LENGTH` directly so NoteContent.create rejects on read.
    const oversized = 'a'.repeat(NoteContent.MAX_LENGTH + 1);
    rawHandle(repo)
      .prepare(
        `INSERT INTO drafts (id, content, pinned, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?)`,
      )
      .run(
        '11111111-1111-4111-8111-111111111111',
        oversized,
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );

    await expect(repo.findLatest()).rejects.toThrowError(/Corrupted draft content/);
  });
});

describe('SqliteDraftRepository — concurrent writes', () => {
  it('N concurrent upserts on the same id collapse to a single row', async () => {
    const repo = makeRepo();
    try {
      const id = '11111111-1111-4111-8111-111111111111';
      const writes = Array.from({ length: 50 }, (_, i) =>
        repo.save(makeDraft({
          id,
          content: `v${i}`,
          updatedAt: new Date(2026, 0, 1, 0, 0, i),
        })),
      );

      await Promise.all(writes);

      const rows = rawHandle(repo).prepare('SELECT id, content, updated_at FROM drafts').all();
      expect(rows).toHaveLength(1);
      // better-sqlite3 is synchronous, so each `save` resolves in dispatch order.
      // We simply assert the row reflects ONE of the writes — no partial / torn state.
      const row = rows[0] as { id: string; content: string };
      expect(row.id).toBe(id);
      expect(row.content).toMatch(/^v\d+$/);
    } finally {
      repo.close();
    }
  });

  it('N concurrent saves on distinct ids produce exactly N rows', async () => {
    const repo = makeRepo();
    try {
      const count = 100;
      const writes = Array.from({ length: count }, (_, i) => {
        const id = `${i.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
        return repo.save(makeDraft({ id, content: `n${i}` }));
      });

      await Promise.all(writes);

      const { c } = rawHandle(repo).prepare('SELECT COUNT(*) AS c FROM drafts').get() as { c: number };
      expect(c).toBe(count);
    } finally {
      repo.close();
    }
  });

  it('multi-connection: a write through one repo is visible to a second repo on the same file', async () => {
    const file = `/tmp/inmemnote-draft-multi-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
    const writer = new SqliteDraftRepository(file);
    const reader = new SqliteDraftRepository(file);
    try {
      const id = unwrap(DraftId.create('11111111-1111-4111-8111-111111111111'));
      await writer.save(makeDraft({ content: 'shared' }));

      const seen = await reader.findById(id);
      expect(seen?.content.value).toBe('shared');
    } finally {
      writer.close();
      reader.close();
    }
  });
});
