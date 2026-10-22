import { NoteId } from '@domain/note/NoteId';
import { IPC, type NoteDTO } from '@infrastructure/electron/ipc-channels';
import { ipcMain } from 'electron';

import { noteToDTO } from '../dto';

import { NoteIdArgs, NotesListArgs, NotesSaveArgs, NotesSearchArgs } from './notes.schemas';
import { parseIpcArgs } from './validate';

import type { UseCases } from '../composition';

/**
 * Register every `IPC.Notes*` channel. Mutating channels broadcast
 * `IPC.NotesChanged` via `emitNotesChanged` so every open window can
 * refresh its view. Every payload is validated by `notes.schemas.ts` before
 * a use-case sees it.
 */
export function registerNotesIpc(deps: {
  uc: Pick<
    UseCases,
    | 'listNotes'
    | 'findNote'
    | 'createNote'
    | 'updateNote'
    | 'togglePinNote'
    | 'deleteNote'
    | 'searchNotes'
  >;
  emitNotesChanged: () => void;
}): void {
  const { uc, emitNotesChanged } = deps;

  ipcMain.handle(IPC.NotesList, async (_e, ...args: unknown[]): Promise<NoteDTO[]> => {
    const [filter] = parseIpcArgs(IPC.NotesList, NotesListArgs, args);
    const list = await uc.listNotes.execute(filter);
    return list.map(noteToDTO);
  });

  ipcMain.handle(IPC.NotesGet, async (_e, ...args: unknown[]): Promise<NoteDTO | null> => {
    const [id] = parseIpcArgs(IPC.NotesGet, NoteIdArgs, args);
    const idResult = NoteId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const found = await uc.findNote.execute(idResult.value);
    return found ? noteToDTO(found) : null;
  });

  ipcMain.handle(IPC.NotesCreate, async (): Promise<NoteDTO> => {
    const created = await uc.createNote.execute();
    emitNotesChanged();
    return noteToDTO(created);
  });

  ipcMain.handle(IPC.NotesSave, async (_e, ...args: unknown[]): Promise<NoteDTO> => {
    const [id, content] = parseIpcArgs(IPC.NotesSave, NotesSaveArgs, args);
    const idResult = NoteId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await uc.updateNote.execute(idResult.value, content);
    if (!r.ok) throw new Error(r.error.message);
    emitNotesChanged();
    return noteToDTO(r.value);
  });

  ipcMain.handle(IPC.NotesTogglePin, async (_e, ...args: unknown[]): Promise<NoteDTO> => {
    const [id] = parseIpcArgs(IPC.NotesTogglePin, NoteIdArgs, args);
    const idResult = NoteId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await uc.togglePinNote.execute(idResult.value);
    if (!r.ok) throw new Error(r.error.message);
    emitNotesChanged();
    return noteToDTO(r.value);
  });

  ipcMain.handle(IPC.NotesDelete, async (_e, ...args: unknown[]): Promise<void> => {
    const [id] = parseIpcArgs(IPC.NotesDelete, NoteIdArgs, args);
    const idResult = NoteId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    await uc.deleteNote.execute(idResult.value);
    emitNotesChanged();
  });

  ipcMain.handle(IPC.NotesSearch, async (_e, ...args: unknown[]): Promise<NoteDTO[]> => {
    const [query] = parseIpcArgs(IPC.NotesSearch, NotesSearchArgs, args);
    const list = await uc.searchNotes.execute(query);
    return list.map(noteToDTO);
  });
}
