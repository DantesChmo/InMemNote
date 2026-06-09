import { AppSettingsParse, type AppSettings } from '@domain/settings/AppSettings';
import {
  type AppSettingsDTO,
  type DraftDTO,
  type NoteDTO,
} from '@infrastructure/electron/ipc-channels';

import type { DraftNote } from '@domain/draft/DraftNote';
import type { Note } from '@domain/note/Note';

/**
 * Pure DTO mappers between domain aggregates and the wire-shape used over
 * IPC. Lives in the main process because the renderer never imports domain
 * directly — DTOs are the only thing that crosses the boundary.
 */

export function draftToDTO(d: DraftNote): DraftDTO {
  return {
    id: d.id,
    content: d.content.value,
    pinned: d.pinned,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function noteToDTO(n: Note): NoteDTO {
  return {
    id: n.id,
    content: n.content.value,
    title: n.title(),
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

export function settingsToDTO(s: AppSettings): AppSettingsDTO {
  const plain = AppSettingsParse.toPlain(s);
  return {
    themeMode: plain.themeMode as AppSettingsDTO['themeMode'],
    language: plain.language as AppSettingsDTO['language'],
    palette: plain.palette,
    openDraftHotkey: plain.openDraftHotkey,
  };
}
