// Exhaustive spec for AppSettings.
//
// AppSettings is the aggregate that wires four VOs together. It is the bridge
// between disk/JSON shape (AppSettingsPlain) and validated runtime state. We
// pin:
//   - default() composition (every default field matches its VO's default);
//   - immutability of all four `with*` setters (only the named field changes);
//   - fromPlain matrix: present-and-valid / missing / present-but-invalid for
//     every field — defaults fill in for missing, Err returns for invalid;
//   - error fall-through ordering (which VO raises first when many fields are
//     bad — pinning this prevents silent reordering of validation);
//   - toPlain shape (Required<>: every key always present);
//   - full round-trip through toPlain → fromPlain.
import { describe, expect, it } from 'vitest';

import { unwrap } from '@shared/Result';

import {
  AppSettings,
  AppSettingsParse,
  type AppSettingsPlain,
} from './AppSettings';
import { Hotkey, InvalidHotkeyError } from './Hotkey';
import { InvalidLanguageModeError } from './LanguageMode';
import { InvalidPaletteTokenError, PaletteOverrides } from './PaletteOverrides';
import { InvalidThemeModeError } from './ThemeMode';

describe('AppSettings.default', () => {
  it('composes the per-VO defaults verbatim', () => {
    const s = AppSettings.default();
    expect(s.themeMode).toBe('system');
    expect(s.language).toBe('system');
    expect(s.palette.isEmpty()).toBe(true);
    expect(s.openDraftHotkey.accelerator).toBe('CommandOrControl+Shift+Space');
  });

  it('returns a fresh aggregate each call (no shared mutable state)', () => {
    const a = AppSettings.default();
    const b = AppSettings.default();
    expect(a).not.toBe(b);
    // Field values agree because they're primitives / immutable VOs.
    expect(a.themeMode).toBe(b.themeMode);
    expect(a.openDraftHotkey.equals(b.openDraftHotkey)).toBe(true);
  });
});

describe('AppSettings.create', () => {
  it('builds an aggregate from validated props', () => {
    const hotkey = unwrap(Hotkey.create('CommandOrControl+J'));
    const palette = unwrap(PaletteOverrides.create({ accent: '#abcdef' }));
    const s = AppSettings.create({
      themeMode: 'dark',
      language: 'ru',
      palette,
      openDraftHotkey: hotkey,
    });
    expect(s.themeMode).toBe('dark');
    expect(s.language).toBe('ru');
    expect(s.palette).toBe(palette);
    expect(s.openDraftHotkey).toBe(hotkey);
  });
});

describe('AppSettings — immutability of with* setters', () => {
  // Each setter must (1) return a new instance, (2) change only the named
  // field, (3) leave the original untouched. We pin all four.
  it('withThemeMode changes only themeMode', () => {
    const a = AppSettings.default();
    const b = a.withThemeMode('dark');
    expect(b).not.toBe(a);
    expect(a.themeMode).toBe('system');
    expect(b.themeMode).toBe('dark');
    expect(b.language).toBe(a.language);
    expect(b.palette).toBe(a.palette);
    expect(b.openDraftHotkey).toBe(a.openDraftHotkey);
  });

  it('withLanguage changes only language', () => {
    const a = AppSettings.default();
    const b = a.withLanguage('en');
    expect(b).not.toBe(a);
    expect(a.language).toBe('system');
    expect(b.language).toBe('en');
    expect(b.themeMode).toBe(a.themeMode);
    expect(b.palette).toBe(a.palette);
    expect(b.openDraftHotkey).toBe(a.openDraftHotkey);
  });

  it('withPalette changes only palette', () => {
    const a = AppSettings.default();
    const palette = unwrap(PaletteOverrides.create({ accent: '#abcdef' }));
    const b = a.withPalette(palette);
    expect(b).not.toBe(a);
    expect(a.palette.isEmpty()).toBe(true);
    expect(b.palette).toBe(palette);
    expect(b.themeMode).toBe(a.themeMode);
    expect(b.language).toBe(a.language);
    expect(b.openDraftHotkey).toBe(a.openDraftHotkey);
  });

  it('withOpenDraftHotkey changes only openDraftHotkey', () => {
    const a = AppSettings.default();
    const hk = unwrap(Hotkey.create('CommandOrControl+J'));
    const b = a.withOpenDraftHotkey(hk);
    expect(b).not.toBe(a);
    expect(a.openDraftHotkey.accelerator).toBe('CommandOrControl+Shift+Space');
    expect(b.openDraftHotkey).toBe(hk);
    expect(b.themeMode).toBe(a.themeMode);
    expect(b.language).toBe(a.language);
    expect(b.palette).toBe(a.palette);
  });

  it('chained setters compose without losing earlier edits', () => {
    const hk = unwrap(Hotkey.create('CommandOrControl+J'));
    const s = AppSettings.default()
      .withThemeMode('dark')
      .withLanguage('ru')
      .withOpenDraftHotkey(hk);
    expect(s.themeMode).toBe('dark');
    expect(s.language).toBe('ru');
    expect(s.openDraftHotkey).toBe(hk);
  });
});

describe('AppSettingsParse.fromPlain — present and valid', () => {
  it('parses a fully populated payload', () => {
    const r = AppSettingsParse.fromPlain({
      themeMode: 'dark',
      language: 'ru',
      palette: { accent: '#abcdef' },
      openDraftHotkey: 'CommandOrControl+K',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.themeMode).toBe('dark');
      expect(r.value.language).toBe('ru');
      expect(r.value.palette.get('accent')).toBe('#abcdef');
      expect(r.value.openDraftHotkey.accelerator).toBe('CommandOrControl+K');
    }
  });

  it.each([
    ['themeMode=light', { themeMode: 'light' } as AppSettingsPlain],
    ['language=en', { language: 'en' } as AppSettingsPlain],
    ['palette empty object', { palette: {} } as AppSettingsPlain],
    ['hotkey alone', { openDraftHotkey: 'F1' } as AppSettingsPlain],
  ])('accepts %s while filling defaults for the rest', (_label, plain) => {
    const r = AppSettingsParse.fromPlain(plain);
    expect(r.ok).toBe(true);
  });
});

describe('AppSettingsParse.fromPlain — missing fields fall back to defaults (not errors)', () => {
  const defaults = AppSettings.default();

  it('empty payload yields defaults everywhere', () => {
    const r = AppSettingsParse.fromPlain({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.themeMode).toBe(defaults.themeMode);
      expect(r.value.language).toBe(defaults.language);
      expect(r.value.palette.isEmpty()).toBe(true);
      expect(r.value.openDraftHotkey.equals(defaults.openDraftHotkey)).toBe(true);
    }
  });

  it('per-field absence pulls the per-field default', () => {
    const r = unwrap(AppSettingsParse.fromPlain({ themeMode: 'dark' }));
    // Only themeMode was specified → others should match defaults.
    expect(r.themeMode).toBe('dark');
    expect(r.language).toBe(defaults.language);
    expect(r.palette.isEmpty()).toBe(true);
    expect(r.openDraftHotkey.equals(defaults.openDraftHotkey)).toBe(true);
  });
});

describe('AppSettingsParse.fromPlain — present-but-invalid returns Err of the matching error type', () => {
  it('invalid themeMode → InvalidThemeModeError', () => {
    const r = AppSettingsParse.fromPlain({ themeMode: 'sepia' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidThemeModeError);
  });

  it('invalid language → InvalidLanguageModeError', () => {
    const r = AppSettingsParse.fromPlain({ language: 'fr' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidLanguageModeError);
  });

  it('invalid palette token → InvalidPaletteTokenError', () => {
    const r = AppSettingsParse.fromPlain({ palette: { 'no-such-key': '#ffffff' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidPaletteTokenError);
  });

  it('invalid hotkey → InvalidHotkeyError', () => {
    const r = AppSettingsParse.fromPlain({ openDraftHotkey: 'Shift+Shift' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidHotkeyError);
  });
});

describe('AppSettingsParse.fromPlain — error fall-through ordering', () => {
  // When several fields are bad, the parser must surface the FIRST one it
  // checks. Pinning the order locks down the validation pipeline: if a refactor
  // re-orders the early-returns, this test fails and forces a deliberate
  // decision.
  it('themeMode beats language', () => {
    const r = AppSettingsParse.fromPlain({ themeMode: 'sepia', language: 'fr' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidThemeModeError);
  });

  it('language beats palette', () => {
    const r = AppSettingsParse.fromPlain({
      language: 'fr',
      palette: { 'no-such-key': '#ffffff' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidLanguageModeError);
  });

  it('palette beats hotkey', () => {
    const r = AppSettingsParse.fromPlain({
      palette: { 'no-such-key': '#ffffff' },
      openDraftHotkey: 'Shift+Shift',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidPaletteTokenError);
  });

  it('hotkey is the last gate — only fails when it is the only bad field', () => {
    const r = AppSettingsParse.fromPlain({ openDraftHotkey: 'Shift+Shift' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidHotkeyError);
  });
});

describe('AppSettingsParse.toPlain', () => {
  it('serializes every field — output is Required<AppSettingsPlain>', () => {
    const plain = AppSettingsParse.toPlain(AppSettings.default());
    expect(Object.keys(plain).sort()).toEqual(
      ['language', 'openDraftHotkey', 'palette', 'themeMode'].sort(),
    );
    expect(typeof plain.themeMode).toBe('string');
    expect(typeof plain.language).toBe('string');
    expect(typeof plain.palette).toBe('object');
    expect(typeof plain.openDraftHotkey).toBe('string');
  });

  it('palette flattens to its toJSON form', () => {
    const palette = unwrap(PaletteOverrides.create({ accent: '#abcdef' }));
    const s = AppSettings.default().withPalette(palette);
    const plain = AppSettingsParse.toPlain(s);
    expect(plain.palette).toEqual({ accent: '#abcdef' });
  });

  it('openDraftHotkey flattens to the accelerator string', () => {
    const hk = unwrap(Hotkey.create('CommandOrControl+J'));
    const plain = AppSettingsParse.toPlain(AppSettings.default().withOpenDraftHotkey(hk));
    expect(plain.openDraftHotkey).toBe('CommandOrControl+J');
  });
});

describe('AppSettingsParse — full round-trip', () => {
  // Every aggregate that flows through storage MUST survive a round trip
  // unchanged, otherwise we lose user settings silently on each save/load
  // cycle.
  it('round-trips a fully populated aggregate (themeMode + language + palette + hotkey)', () => {
    const start = AppSettings.create({
      themeMode: 'light',
      language: 'ru',
      palette: unwrap(PaletteOverrides.create({ accent: '#3f7d6b', panel: '#101820' })),
      openDraftHotkey: unwrap(Hotkey.create('CommandOrControl+J')),
    });

    const back = unwrap(AppSettingsParse.fromPlain(AppSettingsParse.toPlain(start)));

    expect(back.themeMode).toBe(start.themeMode);
    expect(back.language).toBe(start.language);
    expect(back.openDraftHotkey.equals(start.openDraftHotkey)).toBe(true);
    expect(back.palette.toJSON()).toEqual(start.palette.toJSON());
  });

  it('round-trips the defaults', () => {
    const start = AppSettings.default();
    const back = unwrap(AppSettingsParse.fromPlain(AppSettingsParse.toPlain(start)));
    expect(back.themeMode).toBe(start.themeMode);
    expect(back.language).toBe(start.language);
    expect(back.openDraftHotkey.equals(start.openDraftHotkey)).toBe(true);
    expect(back.palette.toJSON()).toEqual({});
  });
});
