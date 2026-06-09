import { NoteId } from '@domain/note/NoteId';
import {
  IPC,
  type NoteDTO,
  type NoteListFilterDTO,
} from '@infrastructure/electron/ipc-channels';
import { ipcMain } from 'electron';

import { noteToDTO } from '../dto';

import type { UseCases } from '../composition';
import type { NoteListFilter } from '@domain/note/NoteRepository';

/**
 * Register every `IPC.Notes*` channel. Mutating channels broadcast
 * `IPC.NotesChanged` via `emitNotesChanged` so every open window can
 * refresh its view.
 */
export function registerNotesIpc(deps: {
  uc: Pick<
    UseCases,
    'listNotes' | 'findNote' | 'createNote' | 'updateNote' | 'togglePinNote' | 'deleteNote' | 'searchNotes'
  >;
  emitNotesChanged: () => void;
}): void {
  const { uc, emitNotesChanged } = deps;

  ipcMain.handle(IPC.NotesList, async (_e, filter: NoteListFilterDTO): Promise<NoteDTO[]> => {
    const list = await uc.listNotes.execute(filter as NoteListFilter);
    return list.map(noteToDTO);
  });

  ipcMain.handle(IPC.NotesGet, async (_e, id: string): Promise<NoteDTO | null> => {
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

  ipcMain.handle(IPC.NotesSave, async (_e, id: string, content: string): Promise<NoteDTO> => {
    const idResult = NoteId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await uc.updateNote.execute(idResult.value, content);
    if (!r.ok) throw new Error(r.error.message);
    emitNotesChanged();
    return noteToDTO(r.value);
  });

  ipcMain.handle(IPC.NotesTogglePin, async (_e, id: string): Promise<NoteDTO> => {
    const idResult = NoteId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await uc.togglePinNote.execute(idResult.value);
    if (!r.ok) throw new Error(r.error.message);
    emitNotesChanged();
    return noteToDTO(r.value);
  });

  ipcMain.handle(IPC.NotesDelete, async (_e, id: string): Promise<void> => {
    const idResult = NoteId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    await uc.deleteNote.execute(idResult.value);
    emitNotesChanged();
  });

  ipcMain.handle(IPC.NotesSearch, async (_e, query: string): Promise<NoteDTO[]> => {
    const list = await uc.searchNotes.execute(query);
    return list.map(noteToDTO);
  });
}
