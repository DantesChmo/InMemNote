import { DraftId } from '@domain/draft/DraftId';
import { IPC, type DraftDTO, type NoteDTO } from '@infrastructure/electron/ipc-channels';
import { ipcMain } from 'electron';

import { draftToDTO, noteToDTO } from '../dto';

import {
  DraftIdArgs,
  DraftResizeArgs,
  DraftSaveArgs,
  DraftSetPinSizeArgs,
  DraftTogglePinArgs,
} from './draft.schemas';
import { parseIpcArgs } from './validate';

import type { UseCases } from '../composition';
import type { DraftWindowController } from '../windows/DraftWindowController';
import type { DraftRepository } from '@domain/draft/DraftRepository';

/**
 * Register every `IPC.Draft*` channel.
 *
 * Each handler is a thin shell around two ingredients:
 *   - an application-layer use-case (the only thing that may touch the
 *     domain),
 *   - the window controller (the only thing that may touch the BrowserWindow).
 *
 * The split is intentional: `DraftWindowController` knows nothing about
 * use-cases or DTOs; the use-cases know nothing about windows. The IPC
 * layer is the only place that wires them together — and the place that
 * validates every renderer payload (`draft.schemas.ts`) before either sees it.
 */
export function registerDraftIpc(deps: {
  controller: DraftWindowController;
  drafts: DraftRepository;
  uc: Pick<UseCases, 'openDraft' | 'saveDraft' | 'closeDraft' | 'togglePinDraft' | 'promote'>;
  emitNotesChanged: () => void;
}): void {
  const { controller, drafts, uc, emitNotesChanged } = deps;

  ipcMain.handle(IPC.DraftOpen, async (): Promise<DraftDTO> => {
    const note = await uc.openDraft.execute();
    // `OpenDraftUseCase` builds a fresh aggregate but does not persist —
    // we save here so the renderer can immediately address the new draft
    // by id on subsequent IPC calls.
    await drafts.save(note);
    return draftToDTO(note);
  });

  ipcMain.handle(IPC.DraftSave, async (_e, ...args: unknown[]): Promise<DraftDTO> => {
    const [id, content] = parseIpcArgs(IPC.DraftSave, DraftSaveArgs, args);
    const idResult = DraftId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await uc.saveDraft.execute(idResult.value, content);
    if (!r.ok) throw new Error(r.error.message);
    return draftToDTO(r.value);
  });

  ipcMain.handle(IPC.DraftClose, async (_e, ...args: unknown[]): Promise<void> => {
    const [id] = parseIpcArgs(IPC.DraftClose, DraftIdArgs, args);
    const idResult = DraftId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    await uc.closeDraft.execute(idResult.value);
  });

  ipcMain.handle(IPC.DraftTogglePin, async (_e, ...args: unknown[]): Promise<DraftDTO> => {
    const [id, targetHeight] = parseIpcArgs(IPC.DraftTogglePin, DraftTogglePinArgs, args);
    const idResult = DraftId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await uc.togglePinDraft.execute(idResult.value);
    if (!r.ok) throw new Error(r.error.message);
    controller.applyPinState(r.value.pinned, targetHeight);
    return draftToDTO(r.value);
  });

  ipcMain.handle(IPC.DraftHide, async (): Promise<void> => {
    controller.hideIfUnpinned();
  });

  ipcMain.handle(IPC.DraftResize, async (_e, ...args: unknown[]): Promise<void> => {
    const [rawHeight] = parseIpcArgs(IPC.DraftResize, DraftResizeArgs, args);
    controller.applyContentHeight(rawHeight);
  });

  ipcMain.handle(IPC.DraftSetPinSize, async (_e, ...args: unknown[]): Promise<void> => {
    const [size] = parseIpcArgs(IPC.DraftSetPinSize, DraftSetPinSizeArgs, args);
    controller.setPinSize(size);
  });

  ipcMain.handle(IPC.DraftGetCorner, async () => controller.getCorner());

  ipcMain.handle(IPC.DraftBeginResize, async (): Promise<void> => {
    controller.beginResize();
  });

  ipcMain.handle(IPC.DraftResetPinSize, async (): Promise<void> => {
    controller.resetPinSize();
  });

  ipcMain.handle(IPC.DraftPromote, async (_e, ...args: unknown[]): Promise<NoteDTO | null> => {
    const [id] = parseIpcArgs(IPC.DraftPromote, DraftIdArgs, args);
    const idResult = DraftId.create(id);
    if (!idResult.ok) throw new Error(idResult.error.message);
    const r = await uc.promote.execute(idResult.value);
    if (!r.ok) throw new Error(r.error.message);
    if (r.value) emitNotesChanged();
    return r.value ? noteToDTO(r.value) : null;
  });
}
