import { settingsDTO } from '../../test/mockInmemnoteApi';

import { applyAppearance, sameAppearance } from './applyTheme';

// `applyAppearance` owns three bits of `<html>`: `data-theme`, `lang`, and the
// inline custom properties for palette overrides. Every assertion below reads
// those back from the real jsdom document.
const root = document.documentElement;

function stubPrefersLight(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: query === '(prefers-color-scheme: light)' ? matches : false,
        media: query,
      }) as MediaQueryList,
  );
}

describe('applyAppearance', () => {
  beforeEach(() => {
    root.removeAttribute('style');
    root.removeAttribute('lang');
    delete root.dataset.theme;
    delete root.dataset.paletteKeys;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('theme mode', () => {
    it.each(['dark', 'light'] as const)('pins data-theme to an explicit "%s" mode', (mode) => {
      applyAppearance(settingsDTO({ themeMode: mode }));

      expect(root.dataset.theme).toBe(mode);
    });

    it('explicit mode ignores the OS preference', () => {
      stubPrefersLight(true);

      applyAppearance(settingsDTO({ themeMode: 'dark' }));

      expect(root.dataset.theme).toBe('dark');
    });

    it('"system" resolves to light when the OS prefers light', () => {
      stubPrefersLight(true);

      applyAppearance(settingsDTO({ themeMode: 'system' }));

      expect(root.dataset.theme).toBe('light');
    });

    it('"system" resolves to dark when the OS does not prefer light', () => {
      stubPrefersLight(false);

      applyAppearance(settingsDTO({ themeMode: 'system' }));

      expect(root.dataset.theme).toBe('dark');
    });

    it('switching from an explicit mode back to "system" re-reads the OS preference', () => {
      stubPrefersLight(false);
      applyAppearance(settingsDTO({ themeMode: 'light' }));

      applyAppearance(settingsDTO({ themeMode: 'system' }));

      expect(root.dataset.theme).toBe('dark');
    });
  });

  describe('language', () => {
    it.each(['en', 'ru'] as const)('sets <html lang> to an explicit "%s"', (language) => {
      applyAppearance(settingsDTO({ themeMode: 'dark', language }));

      expect(root.lang).toBe(language);
    });

    it('follows later language changes', () => {
      applyAppearance(settingsDTO({ themeMode: 'dark', language: 'ru' }));
      applyAppearance(settingsDTO({ themeMode: 'dark', language: 'en' }));

      expect(root.lang).toBe('en');
    });
  });

  describe('palette overrides', () => {
    it('exposes every override as an inline custom property on <html>', () => {
      applyAppearance(
        settingsDTO({ themeMode: 'dark', palette: { accent: '#ff0000', bg: '#101010' } }),
      );

      expect(root.style.getPropertyValue('--accent')).toBe('#ff0000');
      expect(root.style.getPropertyValue('--bg')).toBe('#101010');
    });

    it('leaves tokens without an override to the theme (no inline value)', () => {
      applyAppearance(settingsDTO({ themeMode: 'dark', palette: { accent: '#ff0000' } }));

      expect(root.style.getPropertyValue('--bg')).toBe('');
    });

    it('updates the value of an override that is re-applied with a new color', () => {
      applyAppearance(settingsDTO({ themeMode: 'dark', palette: { accent: '#ff0000' } }));
      applyAppearance(settingsDTO({ themeMode: 'dark', palette: { accent: '#00ff00' } }));

      expect(root.style.getPropertyValue('--accent')).toBe('#00ff00');
    });

    it('removes an override that disappeared from the palette', () => {
      applyAppearance(
        settingsDTO({ themeMode: 'dark', palette: { accent: '#ff0000', bg: '#101010' } }),
      );

      applyAppearance(settingsDTO({ themeMode: 'dark', palette: { bg: '#101010' } }));

      expect(root.style.getPropertyValue('--accent')).toBe('');
      expect(root.style.getPropertyValue('--bg')).toBe('#101010');
    });

    it('an empty palette clears every previously applied override', () => {
      applyAppearance(
        settingsDTO({ themeMode: 'dark', palette: { accent: '#ff0000', bg: '#101010' } }),
      );

      applyAppearance(settingsDTO({ themeMode: 'dark', palette: {} }));

      expect(root.style.getPropertyValue('--accent')).toBe('');
      expect(root.style.getPropertyValue('--bg')).toBe('');
    });

    it('does not touch inline custom properties it did not set itself', () => {
      root.style.setProperty('--panel-height', '320px');

      applyAppearance(settingsDTO({ themeMode: 'dark', palette: { accent: '#ff0000' } }));
      applyAppearance(settingsDTO({ themeMode: 'dark', palette: {} }));

      expect(root.style.getPropertyValue('--panel-height')).toBe('320px');
    });

    it('theme switches keep the overrides in place (they win over either theme)', () => {
      applyAppearance(settingsDTO({ themeMode: 'dark', palette: { accent: '#ff0000' } }));
      applyAppearance(settingsDTO({ themeMode: 'light', palette: { accent: '#ff0000' } }));

      expect(root.dataset.theme).toBe('light');
      expect(root.style.getPropertyValue('--accent')).toBe('#ff0000');
    });
  });
});

// Draft only hears about a save through the `settings:changed` broadcast, and
// `app/main.tsx` skips `applyAppearance` when this says nothing changed.
describe('sameAppearance', () => {
  it('identical settings need no repaint', () => {
    expect(sameAppearance(settingsDTO(), settingsDTO())).toBe(true);
  });

  it('a language-only change needs a repaint (html lang)', () => {
    expect(sameAppearance(settingsDTO({ language: 'ru' }), settingsDTO({ language: 'en' }))).toBe(
      false,
    );
  });

  it('a theme change needs a repaint', () => {
    expect(
      sameAppearance(settingsDTO({ themeMode: 'dark' }), settingsDTO({ themeMode: 'light' })),
    ).toBe(false);
  });

  it('a changed palette value or token set needs a repaint', () => {
    const base = settingsDTO({ palette: { accent: '#ff0000' } });
    expect(sameAppearance(base, settingsDTO({ palette: { accent: '#00ff00' } }))).toBe(false);
    expect(sameAppearance(base, settingsDTO({ palette: { panel: '#ff0000' } }))).toBe(false);
    expect(sameAppearance(base, settingsDTO({ palette: {} }))).toBe(false);
  });
});
