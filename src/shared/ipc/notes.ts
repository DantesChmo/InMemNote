import type { Unsubscribe } from './subscription';

/**
 * IPC contract for the Library's notes: channel names, wire DTOs and the
 * `window.inmemnote.notes` surface. Pure types + constants — see ADR 0005.
 */

export const NotesChannels = {
  NotesList: 'notes:list',
  NotesGet: 'notes:get',
  NotesCreate: 'notes:create',
  NotesSave: 'notes:save',
  NotesTogglePin: 'notes:togglePin',
  NotesDelete: 'notes:delete',
  NotesSearch: 'notes:search',
  // Cross-window: main pushes "the library changed" so the Library window can
  // refresh its list when notes are mutated elsewhere (e.g. promoted from Draft).
  NotesChanged: 'notes:changed',
} as const;

/**
 * DTO for a library note. Includes a derived `title` so the renderer doesn't
 * have to keep the title-stripping rules in sync with the domain.
 */
export interface NoteDTO {
  id: string;
  content: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NoteListFilterDTO = 'all' | 'pinned';

export interface NotesBridge {
  list(filter: NoteListFilterDTO): Promise<NoteDTO[]>;
  get(id: string): Promise<NoteDTO | null>;
  create(): Promise<NoteDTO>;
  save(id: string, content: string): Promise<NoteDTO>;
  togglePin(id: string): Promise<NoteDTO>;
  delete(id: string): Promise<void>;
  search(query: string): Promise<NoteDTO[]>;
  /**
   * Subscribe to "the library changed elsewhere" broadcasts so a Library
   * window stays in sync when, e.g., a draft was promoted.
   */
  onChanged(handler: () => void): Unsubscribe;
}
