import { resolveLocale } from '@presentation/i18n/resolveLocale';

import type { AppSettingsDTO } from '@infrastructure/electron/ipc-channels';

/**
 * DOM-side application of the persisted theme + palette overrides.
 *
 * Runs at app boot AND on every `settings:changed` broadcast — there's no
 * second source of truth, so flipping the theme picker re-runs this code.
 *
 * Theme mode: `system` follows `prefers-color-scheme`, anything else pins
 * the `data-theme` attribute so `tokens.css` exposes the matching palette.
 *
 * Palette overrides: applied as inline custom properties on `html`. Inline
 * styles win over the `html[data-theme=...]` selectors (higher specificity:
 * inline beats author-stylesheet rules), so overrides take precedence even
 * when the user is in dark mode. Tokens absent from the map fall back to
 * the theme defaults — that's the whole point of the sparse map.
 */
export function applyAppearance(settings: AppSettingsDTO): void {
  const root = document.documentElement;

  // ----- Theme mode -----
  if (settings.themeMode === 'system') {
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    root.dataset.theme = prefersLight ? 'light' : 'dark';
  } else {
    root.dataset.theme = settings.themeMode;
  }

  // ----- Language -----
  //
  // `<html lang>` doesn't affect the rendered dictionary (that's a React-side
  // concern owned by `useTranslation`), but it DOES drive screen-reader
  // pronunciation, browser spellcheck dictionary picks, and `:lang(...)` CSS
  // selectors. Keep it in sync so future a11y / typographic work has a
  // single source of truth.
  root.lang = resolveLocale(settings.language);

  // ----- Palette overrides -----
  //
  // Clear ANY previously applied override before re-applying — otherwise
  // toggling a color off in the popup would leave the inline value behind.
  // We track which keys are currently inline via a `data-` attribute so we
  // don't have to know every palette token name in two places.
  const previous = (root.dataset.paletteKeys ?? '').split(',').filter(Boolean);
  for (const key of previous) {
    root.style.removeProperty(`--${key}`);
  }
  const nextKeys: string[] = [];
  for (const [key, value] of Object.entries(settings.palette)) {
    root.style.setProperty(`--${key}`, value);
    nextKeys.push(key);
  }
  if (nextKeys.length > 0) {
    root.dataset.paletteKeys = nextKeys.join(',');
  } else {
    delete root.dataset.paletteKeys;
  }
}
