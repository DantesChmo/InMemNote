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
  /** Renderer-driven manual resize of the pinned overlay (width + height). */
  DraftSetPinSize: 'draft:setPinSize',
  /** Restore the pinned overlay to its default width/height. */
  DraftResetPinSize: 'draft:resetPinSize',
  /** Renderer asks main "which corner is the pin currently anchored to?" */
  DraftGetCorner: 'draft:getCorner',
  /**
   * Tell main "the user just grabbed the resize handle". Main captures the
   * current cursor position + window bounds and starts following the
   * AppKit-level mouse-drag stream until the next mouse-up.
   */
  DraftBeginResize: 'draft:beginResize',
  /**
   * Main broadcast: "the panel is now sized by the user, not by content".
   * Renderer flips the body layout from fit-content (with max-height) to
   * `flex: 1` so the editor fills whatever bounds main hands the window.
   */
  DraftCustomSizeChanged: 'draft:customSizeChanged',

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
