import { InMemoryDraftRepository } from '@infrastructure/persistence/InMemoryDraftRepository';
import { InMemoryNoteRepository } from '@infrastructure/persistence/InMemoryNoteRepository';
import { InMemorySettingsRepository } from '@infrastructure/persistence/InMemorySettingsRepository';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { buildContainer as BuildContainerFn } from '../composition';

const SqliteDraftMock = vi.fn();
const SqliteNoteMock = vi.fn();
const SqliteSettingsMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/userData'),
  },
}));

vi.mock('@infrastructure/persistence/sqlite/SqliteDraftRepository', () => ({
  SqliteDraftRepository: vi.fn((...args: unknown[]) => SqliteDraftMock(...args)),
}));
vi.mock('@infrastructure/persistence/sqlite/SqliteNoteRepository', () => ({
  SqliteNoteRepository: vi.fn((...args: unknown[]) => SqliteNoteMock(...args)),
}));
vi.mock('@infrastructure/persistence/sqlite/SqliteSettingsRepository', () => ({
  SqliteSettingsRepository: vi.fn((...args: unknown[]) => SqliteSettingsMock(...args)),
}));

let buildContainer: typeof BuildContainerFn;

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  SqliteDraftMock.mockReset();
  SqliteNoteMock.mockReset();
  SqliteSettingsMock.mockReset();
  ({ buildContainer } = await import('../composition'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildContainer', () => {
  it('falls back to in-memory repos when every SQLite constructor throws', () => {
    SqliteDraftMock.mockImplementation(() => {
      throw new Error('no native');
    });
    SqliteNoteMock.mockImplementation(() => {
      throw new Error('no native');
    });
    SqliteSettingsMock.mockImplementation(() => {
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

  it('falls back per-repo, not atomically (one failure does not knock the others over)', () => {
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
});
