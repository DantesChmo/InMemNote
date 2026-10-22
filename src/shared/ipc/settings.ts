import type { Unsubscribe } from './subscription';

/**
 * IPC contract for app settings: channel names, wire DTOs and the
 * `window.inmemnote.settings` surface. Pure types + constants — see ADR 0002.
 */

export const SettingsChannels = {
  SettingsLoad: 'settings:load',
  SettingsSave: 'settings:save',
  /**
   * Broadcast from main after a successful save: every renderer window
   * (Library + Draft) refreshes its local settings cache and re-applies the
   * theme/palette to the DOM.
   */
  SettingsChanged: 'settings:changed',
} as const;

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

export interface SettingsBridge {
  /** Load the merged AppSettings (defaults + persisted overrides). */
  load(): Promise<AppSettingsDTO>;
  /**
   * Persist a partial patch (only the fields the popup touched). Main
   * re-validates through the domain layer; an `Err` becomes a rejected
   * Promise so the popup can surface a toast.
   */
  save(patch: AppSettingsPatchDTO): Promise<AppSettingsDTO>;
  /**
   * Subscribe to "settings changed elsewhere" — main broadcasts after every
   * successful save so the second open window can re-apply the theme.
   */
  onChanged(handler: (next: AppSettingsDTO) => void): Unsubscribe;
}
