import { describe, expect, it } from 'vitest';

import { AppSettings, AppSettingsParse } from './AppSettings';

describe('AppSettings', () => {
  it('exposes sensible defaults on first launch', () => {
    const s = AppSettings.default();
    expect(s.themeMode).toBe('system');
    expect(s.language).toBe('system');
    expect(s.palette.isEmpty()).toBe(true);
    expect(s.openDraftHotkey.accelerator).toBe('CommandOrControl+Shift+Space');
  });

  it('produces a new aggregate on each `with*` (immutability)', () => {
    const a = AppSettings.default();
    const b = a.withThemeMode('dark').withLanguage('en');
    expect(a.themeMode).toBe('system');
    expect(a.language).toBe('system');
    expect(b.themeMode).toBe('dark');
    expect(b.language).toBe('en');
  });
});

describe('AppSettingsParse.fromPlain', () => {
  it('parses a fully populated payload', () => {
    const result = AppSettingsParse.fromPlain({
      themeMode: 'dark',
      language: 'ru',
      palette: { accent: '#abcdef' },
      openDraftHotkey: 'CommandOrControl+K',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.themeMode).toBe('dark');
      expect(result.value.language).toBe('ru');
      expect(result.value.palette.get('accent')).toBe('#abcdef');
      expect(result.value.openDraftHotkey.accelerator).toBe('CommandOrControl+K');
    }
  });

  it('rejects an unknown language code', () => {
    const result = AppSettingsParse.fromPlain({ language: 'fr' });
    expect(result.ok).toBe(false);
  });

  it('treats missing fields as "use default", not as errors', () => {
    const result = AppSettingsParse.fromPlain({ themeMode: 'light' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.themeMode).toBe('light');
      expect(result.value.palette.isEmpty()).toBe(true);
      expect(result.value.openDraftHotkey.accelerator).toBe('CommandOrControl+Shift+Space');
    }
  });

  it('rejects a present-but-malformed theme value', () => {
    const result = AppSettingsParse.fromPlain({ themeMode: 'sepia' });
    expect(result.ok).toBe(false);
  });

  it('rejects a present-but-malformed hotkey value', () => {
    const result = AppSettingsParse.fromPlain({ openDraftHotkey: 'Shift+Shift' });
    expect(result.ok).toBe(false);
  });

  it('round-trips through toPlain → fromPlain', () => {
    const parsed = AppSettingsParse.fromPlain({ openDraftHotkey: 'CommandOrControl+J' });
    if (!parsed.ok) throw new Error('test fixture is invalid');
    const start = AppSettings.default()
      .withThemeMode('light')
      .withOpenDraftHotkey(parsed.value.openDraftHotkey);

    const plain = AppSettingsParse.toPlain(start);
    const back = AppSettingsParse.fromPlain(plain);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.value.themeMode).toBe('light');
      expect(back.value.openDraftHotkey.accelerator).toBe('CommandOrControl+J');
    }
  });
});
