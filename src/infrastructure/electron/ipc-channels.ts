/**
 * IPC channel names shared between main and renderer.
 *
 * Centralizing them here keeps the contract in one place and lets TypeScript
 * surface typos at compile time (a stray `'drafl:save'` would fail compilation
 * because nothing imports it).
 */
export const IPC = {
  // Draft (overlay)
  DraftOpen: 'draft:open',
  DraftSave: 'draft:save',
  DraftClose: 'draft:close',
  DraftTogglePin: 'draft:togglePin',
  DraftHide: 'draft:hide',
  DraftResize: 'draft:resize',
  DraftPromote: 'draft:promote',

  // Library (main app)
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

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/**
 * The shape of a draft as it travels through IPC. Domain objects can't cross
 * the bridge (they contain methods/private fields), so we ship a plain DTO.
 */
export interface DraftDTO {
  id: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

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
