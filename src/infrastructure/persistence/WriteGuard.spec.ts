// @vitest-environment node
//
// `WriteGuard` and the `guard*Repository` decorators: unit tests against
// fakes, then integration tests that make a real SQLite write fail after a
// successful open (disk full, file deleted, connection closed on quit) —
// in a per-test temp directory (docs/TESTING.md).

import { mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DraftId } from '@domain/draft/DraftId';
import { DraftNote } from '@domain/draft/DraftNote';
import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { NoteId } from '@domain/note/NoteId';
import { AppSettings } from '@domain/settings/AppSettings';
import { unwrap } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SharedConnection } from './sqlite/SharedConnection';
import { SqliteDraftRepository } from './sqlite/SqliteDraftRepository';
import { SqliteNoteRepository } from './sqlite/SqliteNoteRepository';
import { StorageHealthMonitor } from './StorageHealthMonitor';
import {
  WriteGuard,
  guardDraftRepository,
  guardNoteRepository,
  guardSettingsRepository,
} from './WriteGuard';

import type { DraftRepository } from '@domain/draft/DraftRepository';
import type { NoteRepository } from '@domain/note/NoteRepository';
import type { SettingsRepository } from '@domain/settings/SettingsRepository';

const NOTE_ID = '11111111-1111-4111-8111-111111111111';

function makeNote(content = 'note body', id = NOTE_ID): Note {
  return Note.restore({
    id: unwrap(NoteId.create(id)),
    content: unwrap(NoteContent.create(content)),
    pinned: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function makeDraft(content = 'draft body'): DraftNote {
  return DraftNote.restore({
    id: unwrap(DraftId.create(NOTE_ID)),
    content: unwrap(NoteContent.create(content)),
    pinned: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WriteGuard.run', () => {
  it('passes a successful write through and leaves storage healthy', async () => {
    const health = new StorageHealthMonitor();
    const write = vi.fn(async () => undefined);

    await new WriteGuard('notes', health).run(write);

    expect(write).toHaveBeenCalledTimes(1);
    expect(health.degraded).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('marks the store degraded, logs, and rethrows when the write fails', async () => {
    const health = new StorageHealthMonitor();
    const error = new Error('database or disk is full');

    await expect(
      new WriteGuard('notes', health).run(async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    expect(health.degraded).toEqual([{ store: 'notes', reason: 'database or disk is full' }]);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('notes'), error);
  });

  it('treats a failing post-write check as a failed write', async () => {
    const health = new StorageHealthMonitor();

    await expect(
      new WriteGuard('drafts', health, () => {
        throw new Error('database file was deleted or replaced');
      }).run(async () => undefined),
    ).rejects.toThrow('deleted or replaced');

    expect(health.degraded).toEqual([
      { store: 'drafts', reason: 'database file was deleted or replaced' },
    ]);
  });

  it('does not run the post-write check when the write itself failed', async () => {
    const verify = vi.fn();

    await expect(
      new WriteGuard('notes', new StorageHealthMonitor(), verify).run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(verify).not.toHaveBeenCalled();
  });
});

describe('guard*Repository decorators', () => {
  const failingGuard = (health: StorageHealthMonitor, store: 'drafts' | 'notes' | 'settings') =>
    new WriteGuard(store, health, () => {
      throw new Error('verify failed');
    });

  it('NoteRepository: guards save + delete, passes reads straight through', async () => {
    const note = makeNote();
    const inner: NoteRepository = {
      list: vi.fn(async () => [note]),
      findById: vi.fn(async () => note),
      search: vi.fn(async () => [note]),
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const health = new StorageHealthMonitor();
    const repo = guardNoteRepository(inner, failingGuard(health, 'notes'));

    // Reads are never verified, so the failing check doesn't touch them.
    await expect(repo.list('pinned')).resolves.toEqual([note]);
    await expect(repo.findById(note.id)).resolves.toBe(note);
    await expect(repo.search('q')).resolves.toEqual([note]);
    expect(inner.list).toHaveBeenCalledWith('pinned');
    expect(inner.search).toHaveBeenCalledWith('q');
    expect(health.degraded).toEqual([]);

    await expect(repo.save(note)).rejects.toThrow('verify failed');
    await expect(repo.delete(note.id)).rejects.toThrow('verify failed');
    expect(inner.save).toHaveBeenCalledWith(note);
    expect(inner.delete).toHaveBeenCalledWith(note.id);
    expect(health.degraded).toEqual([{ store: 'notes', reason: 'verify failed' }]);
  });

  it('DraftRepository: guards save + delete, passes reads straight through', async () => {
    const draft = makeDraft();
    const inner: DraftRepository = {
      findById: vi.fn(async () => draft),
      findLatest: vi.fn(async () => draft),
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const health = new StorageHealthMonitor();
    const repo = guardDraftRepository(inner, failingGuard(health, 'drafts'));

    await expect(repo.findById(draft.id)).resolves.toBe(draft);
    await expect(repo.findLatest()).resolves.toBe(draft);
    expect(health.degraded).toEqual([]);

    await expect(repo.save(draft)).rejects.toThrow('verify failed');
    await expect(repo.delete(draft.id)).rejects.toThrow('verify failed');
    expect(inner.save).toHaveBeenCalledWith(draft);
    expect(inner.delete).toHaveBeenCalledWith(draft.id);
    expect(health.degraded).toEqual([{ store: 'drafts', reason: 'verify failed' }]);
  });

  it('SettingsRepository: guards save, passes load straight through', async () => {
    const settings = AppSettings.default();
    const inner: SettingsRepository = {
      load: vi.fn(async () => settings),
      save: vi.fn(async () => undefined),
    };
    const health = new StorageHealthMonitor();
    const repo = guardSettingsRepository(inner, failingGuard(health, 'settings'));

    await expect(repo.load()).resolves.toBe(settings);
    expect(health.degraded).toEqual([]);

    await expect(repo.save(settings)).rejects.toThrow('verify failed');
    expect(inner.save).toHaveBeenCalledWith(settings);
    expect(health.degraded).toEqual([{ store: 'settings', reason: 'verify failed' }]);
  });
});

describe('write failures after a successful open (real SQLite)', () => {
  let dir: string;
  let connection: SharedConnection;
  let health: StorageHealthMonitor;
  let notes: NoteRepository;
  let drafts: DraftRepository;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'inmemnote-guard-'));
    connection = new SharedConnection(join(dir, 'inmemnote.db'));
    health = new StorageHealthMonitor();
    const verify = () => connection.checkFile();
    notes = guardNoteRepository(
      new SqliteNoteRepository(connection.get()),
      new WriteGuard('notes', health, verify),
    );
    drafts = guardDraftRepository(
      new SqliteDraftRepository(connection.get()),
      new WriteGuard('drafts', health, verify),
    );
  });

  afterEach(() => {
    connection.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('stays healthy while writes succeed', async () => {
    await notes.save(makeNote());
    await drafts.save(makeDraft());

    expect(health.degraded).toEqual([]);
    expect(await notes.findById(makeNote().id)).not.toBeNull();
  });

  it('disk full: the failing store degrades with SQLite’s message', async () => {
    const db = connection.get();
    // Cap the file at its current size so the next page allocation fails
    // exactly like a full disk does (SQLITE_FULL).
    db.pragma(`max_page_count = ${String(db.pragma('page_count', { simple: true }))}`);

    await expect(notes.save(makeNote('x'.repeat(100_000)))).rejects.toThrow(/full/);

    expect(health.degraded).toEqual([{ store: 'notes', reason: 'database or disk is full' }]);
  });

  it('database file deleted: SQLite keeps writing to the unlinked inode, the guard notices', async () => {
    await notes.save(makeNote('before'));

    unlinkSync(join(dir, 'inmemnote.db'));
    await expect(notes.save(makeNote('after'))).rejects.toThrow(/deleted or replaced/);

    expect(health.degraded).toEqual([
      { store: 'notes', reason: expect.stringMatching(/deleted or replaced/) },
    ]);
  });

  it('connection closed on quit: a late write is reported, not dropped silently', async () => {
    connection.close();

    await expect(drafts.save(makeDraft('typed after close'))).rejects.toThrow(/not open/);

    expect(health.degraded).toEqual([
      { store: 'drafts', reason: expect.stringMatching(/not open/) },
    ]);
    expect(consoleError).toHaveBeenCalled();
  });

  it('only the store whose write failed degrades', async () => {
    connection.close();

    await expect(notes.delete(makeNote().id)).rejects.toThrow();

    expect(health.degraded.map((d) => d.store)).toEqual(['notes']);
  });
});
