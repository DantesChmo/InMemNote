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
import { openDatabase } from '@infrastructure/persistence/sqlite/openDatabase';
import { SqliteDraftRepository } from '@infrastructure/persistence/sqlite/SqliteDraftRepository';
import { SqliteNoteRepository } from '@infrastructure/persistence/sqlite/SqliteNoteRepository';
import { SqliteSettingsRepository } from '@infrastructure/persistence/sqlite/SqliteSettingsRepository';
import { SystemClock } from '@infrastructure/SystemClock';
import { app } from 'electron';

import type { DraftRepository } from '@domain/draft/DraftRepository';
import type { NoteRepository } from '@domain/note/NoteRepository';
import type { SettingsRepository } from '@domain/settings/SettingsRepository';
import type Database from 'better-sqlite3';

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
 * try/catch'd so the app can boot against an in-memory store and surface
 * a clear warning — but a failure to open the file reaches every
 * repository, so in practice they fall back together.
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
  uc: UseCases;
}

/**
 * Build the dependency container. MUST be called after `app.whenReady()`
 * resolves — it touches `app.getPath('userData')`.
 */
export function buildContainer(): Container {
  const db = lazyDatabase(join(app.getPath('userData'), 'inmemnote.db'));
  const drafts = buildDraftRepo(db);
  const notes = buildNoteRepo(db);
  const settings = buildSettingsRepo(db);
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

  return { drafts, notes, settings, uc };
}

function buildDraftRepo(db: SharedDatabase): DraftRepository {
  try {
    return new SqliteDraftRepository(db());
  } catch (e) {
    console.warn('SQLite (drafts) init failed; falling back to in-memory.', e);
    return new InMemoryDraftRepository();
  }
}

function buildNoteRepo(db: SharedDatabase): NoteRepository {
  try {
    return new SqliteNoteRepository(db());
  } catch (e) {
    console.warn('SQLite (notes) init failed; falling back to in-memory.', e);
    return new InMemoryNoteRepository();
  }
}

function buildSettingsRepo(db: SharedDatabase): SettingsRepository {
  try {
    return new SqliteSettingsRepository(db());
  } catch (e) {
    console.warn('SQLite (settings) init failed; falling back to in-memory.', e);
    return new InMemorySettingsRepository();
  }
}

type SharedDatabase = () => Database.Database;

/**
 * Open the db file on first call and hand every caller the same connection.
 * A failed open is remembered and rethrown to each caller, so every
 * repository's fallback trips with the same error instead of retrying.
 */
function lazyDatabase(path: string): SharedDatabase {
  let opened: { db: Database.Database } | { error: unknown } | undefined;
  return () => {
    if (!opened) {
      try {
        opened = { db: openDatabase(path) };
      } catch (error) {
        opened = { error };
      }
    }
    if ('error' in opened) throw opened.error;
    return opened.db;
  };
}
