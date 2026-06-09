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
import { SqliteDraftRepository } from '@infrastructure/persistence/sqlite/SqliteDraftRepository';
import { SqliteNoteRepository } from '@infrastructure/persistence/sqlite/SqliteNoteRepository';
import { SqliteSettingsRepository } from '@infrastructure/persistence/sqlite/SqliteSettingsRepository';
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
 * Each SQLite repository constructor is independently try/catch'd: if
 * native bindings fail to load on a particular machine the app can still
 * boot against an in-memory store and surface a clear warning. We don't
 * fall ALL the repos to in-memory atomically because one failing
 * persistence layer shouldn't disable the others.
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
  const drafts = buildDraftRepo();
  const notes = buildNoteRepo();
  const settings = buildSettingsRepo();
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

function buildDraftRepo(): DraftRepository {
  try {
    return new SqliteDraftRepository(join(app.getPath('userData'), 'inmemnote.db'));
  } catch (e) {
    console.warn('SQLite (drafts) init failed; falling back to in-memory.', e);
    return new InMemoryDraftRepository();
  }
}

function buildNoteRepo(): NoteRepository {
  try {
    return new SqliteNoteRepository(join(app.getPath('userData'), 'inmemnote.db'));
  } catch (e) {
    console.warn('SQLite (notes) init failed; falling back to in-memory.', e);
    return new InMemoryNoteRepository();
  }
}

function buildSettingsRepo(): SettingsRepository {
  try {
    return new SqliteSettingsRepository(join(app.getPath('userData'), 'inmemnote.db'));
  } catch (e) {
    console.warn('SQLite (settings) init failed; falling back to in-memory.', e);
    return new InMemorySettingsRepository();
  }
}
