import { join } from 'node:path';

import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { NoteId } from '@domain/note/NoteId';
import { InMemoryDraftRepository } from '@infrastructure/persistence/InMemoryDraftRepository';
import { InMemoryNoteRepository } from '@infrastructure/persistence/InMemoryNoteRepository';
import { InMemorySettingsRepository } from '@infrastructure/persistence/InMemorySettingsRepository';
import { unwrap } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { buildContainer as BuildContainerFn } from '../composition';

const OpenDatabaseMock = vi.fn();
const SqliteDraftMock = vi.fn();
const SqliteNoteMock = vi.fn();
const SqliteSettingsMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/userData'),
  },
}));

vi.mock('@infrastructure/persistence/sqlite/openDatabase', () => ({
  openDatabase: vi.fn((...args: unknown[]) => OpenDatabaseMock(...args)),
}));
vi.mock('@infrastructure/persistence/sqlite/SqliteDraftRepository', () => ({
  // `function`, not an arrow: Vitest 4+ mocks are only `new`-able when the
  // implementation is.
  SqliteDraftRepository: vi.fn(function (...args: unknown[]) {
    return SqliteDraftMock(...args);
  }),
}));
vi.mock('@infrastructure/persistence/sqlite/SqliteNoteRepository', () => ({
  SqliteNoteRepository: vi.fn(function (...args: unknown[]) {
    return SqliteNoteMock(...args);
  }),
}));
vi.mock('@infrastructure/persistence/sqlite/SqliteSettingsRepository', () => ({
  SqliteSettingsRepository: vi.fn(function (...args: unknown[]) {
    return SqliteSettingsMock(...args);
  }),
}));

let buildContainer: typeof BuildContainerFn;

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  OpenDatabaseMock.mockReset();
  SqliteDraftMock.mockReset();
  SqliteNoteMock.mockReset();
  SqliteSettingsMock.mockReset();
  ({ buildContainer } = await import('../composition'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildContainer', () => {
  it('falls back to in-memory repos when the database cannot be opened', () => {
    OpenDatabaseMock.mockImplementation(() => {
      throw new Error('no native');
    });

    const { drafts, notes, settings, uc } = buildContainer();

    expect(drafts).toBeInstanceOf(InMemoryDraftRepository);
    expect(notes).toBeInstanceOf(InMemoryNoteRepository);
    expect(settings).toBeInstanceOf(InMemorySettingsRepository);

    // Every use-case slot is wired
    expect(uc.openDraft).toBeDefined();
    expect(uc.saveDraft).toBeDefined();
    expect(uc.closeDraft).toBeDefined();
    expect(uc.togglePinDraft).toBeDefined();
    expect(uc.promote).toBeDefined();
    expect(uc.listNotes).toBeDefined();
    expect(uc.findNote).toBeDefined();
    expect(uc.createNote).toBeDefined();
    expect(uc.updateNote).toBeDefined();
    expect(uc.togglePinNote).toBeDefined();
    expect(uc.deleteNote).toBeDefined();
    expect(uc.searchNotes).toBeDefined();
    expect(uc.loadSettings).toBeDefined();
    expect(uc.updateSettings).toBeDefined();
  });

  it('hands the same connection, opened from userData, to every SQLite repository', () => {
    const connection = { tag: 'shared-connection' };
    OpenDatabaseMock.mockReturnValue(connection);

    buildContainer();

    expect(OpenDatabaseMock).toHaveBeenCalledWith(join('/tmp/userData', 'inmemnote.db'));
    expect(SqliteDraftMock).toHaveBeenCalledWith(connection);
    expect(SqliteNoteMock).toHaveBeenCalledWith(connection);
    expect(SqliteSettingsMock).toHaveBeenCalledWith(connection);
  });

  it('a failing repository constructor falls back only that repository', () => {
    OpenDatabaseMock.mockReturnValue({});
    SqliteDraftMock.mockImplementation(() => {
      throw new Error('drafts broken');
    });
    // Notes + settings succeed (mocked constructor returns undefined => the
    // wrapping SqliteNoteRepository instance is what's returned by `new`).
    SqliteNoteMock.mockReturnValue(undefined);
    SqliteSettingsMock.mockReturnValue(undefined);

    const { drafts, notes, settings } = buildContainer();

    expect(drafts).toBeInstanceOf(InMemoryDraftRepository);
    // The other two should be the real (mocked) SQLite repos, NOT in-memory.
    expect(notes).not.toBeInstanceOf(InMemoryNoteRepository);
    expect(settings).not.toBeInstanceOf(InMemorySettingsRepository);
  });

  it('reports a healthy storage when every SQLite repo opens', () => {
    SqliteDraftMock.mockReturnValue(undefined);
    SqliteNoteMock.mockReturnValue(undefined);
    SqliteSettingsMock.mockReturnValue(undefined);

    const { storage } = buildContainer();

    expect(storage.degraded).toEqual([]);
  });

  it('records each in-memory fallback with the SQLite error as its reason', () => {
    SqliteDraftMock.mockImplementation(() => {
      throw new Error('drafts broken');
    });
    SqliteNoteMock.mockImplementation(() => {
      throw new Error('notes broken');
    });
    SqliteSettingsMock.mockImplementation(() => {
      throw new Error('settings broken');
    });

    const { storage } = buildContainer();

    expect(storage.degraded).toEqual([
      { store: 'drafts', reason: 'drafts broken' },
      { store: 'notes', reason: 'notes broken' },
      { store: 'settings', reason: 'settings broken' },
    ]);
  });

  it('records only the repo that actually fell back', () => {
    SqliteDraftMock.mockReturnValue(undefined);
    SqliteNoteMock.mockImplementation(() => {
      throw new Error('SQLITE_CANTOPEN');
    });
    SqliteSettingsMock.mockReturnValue(undefined);

    const { storage } = buildContainer();

    expect(storage.degraded).toEqual([{ store: 'notes', reason: 'SQLITE_CANTOPEN' }]);
  });

  it('stringifies a non-Error throw into the reason', () => {
    SqliteDraftMock.mockImplementation(() => {
      // Native bindings occasionally throw plain strings.
      throw 'dlopen failed';
    });
    SqliteNoteMock.mockReturnValue(undefined);
    SqliteSettingsMock.mockReturnValue(undefined);

    const { storage } = buildContainer();

    expect(storage.degraded).toEqual([{ store: 'drafts', reason: 'dlopen failed' }]);
  });

  it('reports a write that fails after boot: the store degrades and listeners hear it', async () => {
    OpenDatabaseMock.mockReturnValue({});
    SqliteDraftMock.mockReturnValue(undefined);
    SqliteSettingsMock.mockReturnValue(undefined);
    SqliteNoteMock.mockReturnValue({
      save: async () => {
        throw new Error('database or disk is full');
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { notes, storage } = buildContainer();
    const listener = vi.fn();
    storage.onChange(listener);

    await expect(notes.save(aNote())).rejects.toThrow('database or disk is full');

    expect(storage.degraded).toEqual([{ store: 'notes', reason: 'database or disk is full' }]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('closeDatabase', () => {
  it('closes the shared connection, once', () => {
    const connection = { close: vi.fn() };
    OpenDatabaseMock.mockReturnValue(connection);
    SqliteDraftMock.mockReturnValue(undefined);
    SqliteNoteMock.mockReturnValue(undefined);
    SqliteSettingsMock.mockReturnValue(undefined);

    const { closeDatabase } = buildContainer();
    closeDatabase();
    closeDatabase();

    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the database never opened', () => {
    OpenDatabaseMock.mockImplementation(() => {
      throw new Error('no native');
    });

    const { closeDatabase } = buildContainer();

    expect(() => closeDatabase()).not.toThrow();
  });
});

function aNote(): Note {
  return Note.restore({
    id: unwrap(NoteId.create('11111111-1111-4111-8111-111111111111')),
    content: unwrap(NoteContent.create('body')),
    pinned: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}
