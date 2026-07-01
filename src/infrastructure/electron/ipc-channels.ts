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
  /**
   * Main pushes hover state for the pinned-window header strip. Detected
   * natively via `NSTrackingArea` because CSS `:hover` doesn't fire on
   * elements with `-webkit-app-region: drag`. Only emitted while the
   * window is pinned — un-pinned mode never highlights.
   */
  DraftHeaderHover: 'draft:headerHover',

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

  // Settings
  SettingsLoad: 'settings:load',
  SettingsSave: 'settings:save',
  /**
   * Broadcast from main after a successful save: every renderer window
   * (Library + Draft) refreshes its local settings cache and re-applies the
   * theme/palette to the DOM.
   */
  SettingsChanged: 'settings:changed',

  // Auto-update
  /** Renderer asks main to check the release feed now. Resolves to a DTO or null. */
  UpdateCheck: 'update:check',
  /** Renderer asks main to download + install the pending update and relaunch. */
  UpdateInstall: 'update:install',
  /**
   * Main broadcast: a newer release was found (by the startup / periodic check
   * or an explicit request). The Library window surfaces its update banner.
   */
  UpdateAvailable: 'update:available',
  /** Main broadcast: download progress during an install, as a 0..1 fraction. */
  UpdateProgress: 'update:progress',
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

/**
 * Settings DTO — the plain transport shape of `AppSettings`.
 *
 * The renderer sends partial payloads (only the fields the user touched) on
 * save; main re-validates through the domain parser before persisting. The
 * `palette` map is sparse: missing keys mean "use the theme default".
 */
export interface AppSettingsDTO {
  themeMode: 'system' | 'dark' | 'light';
  language: 'system' | 'en' | 'ru';
  palette: Readonly<Record<string, string>>;
  openDraftHotkey: string;
}

export type AppSettingsPatchDTO = Partial<AppSettingsDTO>;

/**
 * A newer release, as it crosses IPC to the renderer's update banner.
 * The domain `ReleaseInfo` carries an `AppVersion` object that can't survive
 * the bridge, so we ship the version as a plain `"0.6.0"` string.
 */
export interface AvailableUpdateDTO {
  version: string;
  downloadUrl: string;
  notesUrl: string;
}
