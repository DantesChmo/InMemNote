import { SUPPORTED_LOCALES, type LanguageMode, type Locale } from '@domain/settings/LanguageMode';

/**
 * Map a `LanguageMode` to a concrete `Locale` for dictionary lookup.
 *
 * `'system'` consults `navigator.language` (the browser's view of the OS
 * locale — Electron threads through `app.getLocale()` on macOS). Anything we
 * don't translate yet collapses to English, which is the canonical fallback
 * for a system-mode user on a non-supported OS.
 */
export function resolveLocale(mode: LanguageMode | undefined): Locale {
  if (mode === undefined || mode === 'system') return detectSystemLocale();
  return mode;
}

export function detectSystemLocale(): Locale {
  const raw = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en';
  // `navigator.language` returns "ru-RU", "en-US", "en" — match on the base.
  const base = raw.toLowerCase().split('-')[0] ?? 'en';
  return (SUPPORTED_LOCALES as readonly string[]).includes(base) ? (base as Locale) : 'en';
}
