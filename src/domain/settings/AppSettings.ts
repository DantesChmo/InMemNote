import { Hotkey } from './Hotkey';
import { LanguageMode } from './LanguageMode';
import { PaletteOverrides } from './PaletteOverrides';
import { ThemeMode } from './ThemeMode';

import type { InvalidHotkeyError } from './Hotkey';
import type { InvalidLanguageModeError } from './LanguageMode';
import type { PaletteOverridesError } from './PaletteOverrides';
import type { InvalidThemeModeError } from './ThemeMode';
import type { Result } from '@shared/Result';

/**
 * AppSettings — the persisted user preferences aggregate.
 *
 * Lives independently from `DraftNote` / `Note`: it has no identity (a user
 * has exactly one settings record), no created/updated timestamps the user
 * cares about, and its invariants live entirely inside its value objects.
 *
 * Defaults serve a dual purpose:
 *   1. First launch — there's nothing in the DB yet, return `AppSettings.default()`.
 *   2. Partial repair — if a single field on disk is malformed (e.g. someone
 *      hand-edited the SQLite row), the loader can fall back to the default
 *      for that ONE field rather than refusing to start.
 */
export interface AppSettingsProps {
  themeMode: ThemeMode;
  language: LanguageMode;
  palette: PaletteOverrides;
  openDraftHotkey: Hotkey;
}

export class AppSettings {
  private constructor(private readonly props: AppSettingsProps) {}

  /** Hard-coded defaults — used on first launch and as a recovery fallback. */
  public static default(): AppSettings {
    const hotkey = Hotkey.create('CommandOrControl+Shift+Space');
    if (!hotkey.ok) {
      // The default we ship MUST validate. Failing here means we changed the
      // accelerator list without updating the constant — programmer error.
      throw new Error(`Default openDraft hotkey is invalid: ${hotkey.error.message}`);
    }
    return new AppSettings({
      themeMode: ThemeMode.default(),
      language: LanguageMode.default(),
      palette: PaletteOverrides.empty(),
      openDraftHotkey: hotkey.value,
    });
  }

  public static create(props: AppSettingsProps): AppSettings {
    return new AppSettings(props);
  }

  public get themeMode(): ThemeMode {
    return this.props.themeMode;
  }

  public get language(): LanguageMode {
    return this.props.language;
  }

  public get palette(): PaletteOverrides {
    return this.props.palette;
  }

  public get openDraftHotkey(): Hotkey {
    return this.props.openDraftHotkey;
  }

  public withThemeMode(mode: ThemeMode): AppSettings {
    return new AppSettings({ ...this.props, themeMode: mode });
  }

  public withLanguage(language: LanguageMode): AppSettings {
    return new AppSettings({ ...this.props, language });
  }

  public withPalette(palette: PaletteOverrides): AppSettings {
    return new AppSettings({ ...this.props, palette });
  }

  public withOpenDraftHotkey(hotkey: Hotkey): AppSettings {
    return new AppSettings({ ...this.props, openDraftHotkey: hotkey });
  }
}

/**
 * Parsed-but-unvalidated AppSettings, as it appears in transport (IPC / DB
 * rows / JSON). The loader and use-cases convert this into a real
 * `AppSettings` via `AppSettingsParse.fromPlain`.
 */
export interface AppSettingsPlain {
  themeMode?: string;
  language?: string;
  palette?: Readonly<Record<string, string>>;
  openDraftHotkey?: string;
}

export type AppSettingsParseError =
  | InvalidThemeModeError
  | InvalidLanguageModeError
  | InvalidHotkeyError
  | PaletteOverridesError;

export const AppSettingsParse = {
  /**
   * Build a fully validated `AppSettings` from the plain shape, treating any
   * missing field as "use the default". Returns `Err` only when a present
   * field is structurally invalid — that's a louder signal than absence and
   * the caller (loader) decides whether to fall back further.
   */
  fromPlain(plain: AppSettingsPlain): Result<AppSettings, AppSettingsParseError> {
    const defaults = AppSettings.default();

    let themeMode = defaults.themeMode;
    if (plain.themeMode !== undefined) {
      const parsed = ThemeMode.create(plain.themeMode);
      if (!parsed.ok) return parsed;
      themeMode = parsed.value;
    }

    let language = defaults.language;
    if (plain.language !== undefined) {
      const parsed = LanguageMode.create(plain.language);
      if (!parsed.ok) return parsed;
      language = parsed.value;
    }

    let palette = defaults.palette;
    if (plain.palette !== undefined) {
      const parsed = PaletteOverrides.create(plain.palette);
      if (!parsed.ok) return parsed;
      palette = parsed.value;
    }

    let hotkey = defaults.openDraftHotkey;
    if (plain.openDraftHotkey !== undefined) {
      const parsed = Hotkey.create(plain.openDraftHotkey);
      if (!parsed.ok) return parsed;
      hotkey = parsed.value;
    }

    return {
      ok: true,
      value: AppSettings.create({
        themeMode,
        language,
        palette,
        openDraftHotkey: hotkey,
      }),
    };
  },

  toPlain(settings: AppSettings): Required<AppSettingsPlain> {
    return {
      themeMode: settings.themeMode,
      language: settings.language,
      palette: settings.palette.toJSON(),
      openDraftHotkey: settings.openDraftHotkey.accelerator,
    };
  },
};
