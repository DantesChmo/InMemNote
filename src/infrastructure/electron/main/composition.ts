import { join } from 'node:path';

import { CloseDraftUseCase } from '@application/draft/CloseDraftUseCase';
import { OpenDraftUseCase } from '@application/draft/OpenDraftUseCase';
import { SaveDraftUseCase } from '@application/draft/SaveDraftUseCase';
import { TogglePinUseCase } from '@application/draft/TogglePinUseCase';
import { CreateNoteUseCase } from '@application/note/CreateNoteUseCase';
import { DeleteNoteUseCase } from '@application/note/DeleteNoteUseCase';
import { FindNoteUseCase } from '@application/note/FindNoteUseCase';
import { ListNotesUseCase } from '@application/note/ListNotesUseCase';
import { PromoteDraftToNoteUseCase } from '@application/note/PromoteDraftToNoteUseCase';
import { SearchNotesUseCase } from '@application/note/SearchNotesUseCase';
import { ToggleNotePinUseCase } from '@application/note/ToggleNotePinUseCase';
import { UpdateNoteContentUseCase } from '@application/note/UpdateNoteContentUseCase';
import { LoadSettingsUseCase } from '@application/settings/LoadSettingsUseCase';
import { UpdateSettingsUseCase } from '@application/settings/UpdateSettingsUseCase';
import { InMemoryDraftRepository } from '@infrastructure/persistence/InMemoryDraftRepository';
import { InMemoryNoteRepository } from '@infrastructure/persistence/InMemoryNoteRepository';
import { InMemorySettingsRepository } from '@infrastructure/persistence/InMemorySettingsRepository';
import { SharedConnection } from '@infrastructure/persistence/sqlite/SharedConnection';
import { SqliteDraftRepository } from '@infrastructure/persistence/sqlite/SqliteDraftRepository';
import { SqliteNoteRepository } from '@infrastructure/persistence/sqlite/SqliteNoteRepository';
import { SqliteSettingsRepository } from '@infrastructure/persistence/sqlite/SqliteSettingsRepository';
import {
  StorageHealthMonitor,
  type StorageHealth,
  type StoreName,
} from '@infrastructure/persistence/StorageHealthMonitor';
import {
  WriteGuard,
  guardDraftRepository,
  guardNoteRepository,
  guardSettingsRepository,
} from '@infrastructure/persistence/WriteGuard';
import { SystemClock } from '@infrastructure/SystemClock';
import { app } from 'electron';

import type { DraftRepository } from '@domain/draft/DraftRepository';
import type { NoteRepository } from '@domain/note/NoteRepository';
import type { SettingsRepository } from '@domain/settings/SettingsRepository';

/**
 * Composition root for the main process.
 *
 * One place to swap repository implementations (SQLite vs in-memory),
 * wire use-cases against them, and return everything the IPC layer needs
 * as a single bag. The "container" pattern is intentional — the file
 * stays at the dependency-graph edge, so changes here don't ripple into
 * domain or application code.
 *
 * All SQLite repositories share ONE connection to `inmemnote.db`, opened
 * and migrated here (ADR 0004). Each repository is still independently
 * try/catch'd so the app can boot against an in-memory store — but a
 * failure to open the file reaches every repository, so in practice they
 * fall back together. Every fallback is recorded in `Container.storage`
 * so main can tell the renderer — an in-memory store silently loses
 * everything on quit, so the user must be warned (bug #03).
 *
 * The SQLite repositories are wrapped in write guards: a write that fails
 * after a successful open (disk full, file deleted) degrades that store in
 * the same `Container.storage`, so the same warning appears. The container
 * also owns the connection's end of life — `closeDatabase()` on quit
 * (ADR 0008).
 */

export interface UseCases {
  // Draft
  openDraft: OpenDraftUseCase;
  saveDraft: SaveDraftUseCase;
  closeDraft: CloseDraftUseCase;
  togglePinDraft: TogglePinUseCase;
  promote: PromoteDraftToNoteUseCase;

  // Note
  listNotes: ListNotesUseCase;
  findNote: FindNoteUseCase;
  createNote: CreateNoteUseCase;
  updateNote: UpdateNoteContentUseCase;
  togglePinNote: ToggleNotePinUseCase;
  deleteNote: DeleteNoteUseCase;
  searchNotes: SearchNotesUseCase;

  // Settings
  loadSettings: LoadSettingsUseCase;
  updateSettings: UpdateSettingsUseCase;
}

export interface Container {
  drafts: DraftRepository;
  notes: NoteRepository;
  settings: SettingsRepository;
  storage: StorageHealth;
  uc: UseCases;
  /**
   * Close the shared SQLite connection. Call once, from `will-quit` — after
   * every window has flushed its pending autosave (ADR 0008).
   */
  closeDatabase(): void;
}

/**
 * Build the dependency container. MUST be called after `app.whenReady()`
 * resolves — it touches `app.getPath('userData')`.
 */
export function buildContainer(): Container {
  const db = new SharedConnection(join(app.getPath('userData'), 'inmemnote.db'));
  const health = new StorageHealthMonitor();
  const guard = (store: StoreName) => new WriteGuard(store, health, () => db.checkFile());
  const drafts = buildDraftRepo(db, health, guard('drafts'));
  const notes = buildNoteRepo(db, health, guard('notes'));
  const settings = buildSettingsRepo(db, health, guard('settings'));
  const clock = new SystemClock();

  const uc: UseCases = {
    openDraft: new OpenDraftUseCase(drafts, clock),
    saveDraft: new SaveDraftUseCase(drafts, clock),
    closeDraft: new CloseDraftUseCase(drafts),
    togglePinDraft: new TogglePinUseCase(drafts, clock),
    promote: new PromoteDraftToNoteUseCase(drafts, notes, clock),

    listNotes: new ListNotesUseCase(notes),
    findNote: new FindNoteUseCase(notes),
    createNote: new CreateNoteUseCase(notes, clock),
    updateNote: new UpdateNoteContentUseCase(notes, clock),
    togglePinNote: new ToggleNotePinUseCase(notes, clock),
    deleteNote: new DeleteNoteUseCase(notes),
    searchNotes: new SearchNotesUseCase(notes),

    loadSettings: new LoadSettingsUseCase(settings),
    updateSettings: new UpdateSettingsUseCase(settings),
  };

  return { drafts, notes, settings, storage: health, uc, closeDatabase: () => db.close() };
}

function buildDraftRepo(
  db: SharedConnection,
  health: StorageHealthMonitor,
  guard: WriteGuard,
): DraftRepository {
  try {
    return guardDraftRepository(new SqliteDraftRepository(db.get()), guard);
  } catch (e) {
    console.warn('SQLite (drafts) init failed; falling back to in-memory.', e);
    health.markDegraded('drafts', e);
    return new InMemoryDraftRepository();
  }
}

function buildNoteRepo(
  db: SharedConnection,
  health: StorageHealthMonitor,
  guard: WriteGuard,
): NoteRepository {
  try {
    return guardNoteRepository(new SqliteNoteRepository(db.get()), guard);
  } catch (e) {
    console.warn('SQLite (notes) init failed; falling back to in-memory.', e);
    health.markDegraded('notes', e);
    return new InMemoryNoteRepository();
  }
}

function buildSettingsRepo(
  db: SharedConnection,
  health: StorageHealthMonitor,
  guard: WriteGuard,
): SettingsRepository {
  try {
    return guardSettingsRepository(new SqliteSettingsRepository(db.get()), guard);
  } catch (e) {
    console.warn('SQLite (settings) init failed; falling back to in-memory.', e);
    health.markDegraded('settings', e);
    return new InMemorySettingsRepository();
  }
}
