import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectSystemLocale, resolveLocale } from './resolveLocale';

function systemLanguage(value: string | undefined): void {
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(value as string);
}

describe('resolveLocale', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['en', 'ru'] as const)('a pinned "%s" ignores the OS language', (mode) => {
    systemLanguage(mode === 'en' ? 'ru-RU' : 'en-US');
    expect(resolveLocale(mode)).toBe(mode);
  });

  it('follows the OS language for "system" and for an unset mode', () => {
    systemLanguage('ru-RU');
    expect(resolveLocale('system')).toBe('ru');
    expect(resolveLocale(undefined)).toBe('ru');
  });
});

describe('detectSystemLocale', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['ru', 'ru'],
    ['ru-RU', 'ru'],
    ['RU-ru', 'ru'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
  ])('maps %s to %s (region and case are ignored)', (language, expected) => {
    systemLanguage(language);
    expect(detectSystemLocale()).toBe(expected);
  });

  it.each([['de-DE'], ['fr'], ['zh-Hans-CN'], ['uk-UA']])(
    'falls back to English for the unsupported %s',
    (language) => {
      systemLanguage(language);
      expect(detectSystemLocale()).toBe('en');
    },
  );

  it('falls back to English when the OS reports no language', () => {
    systemLanguage('');
    expect(detectSystemLocale()).toBe('en');
  });

  it('does not mistake a longer language code for a supported one', () => {
    // "rus" / "english" are not "ru" / "en": only the subtag before "-" counts.
    systemLanguage('rus');
    expect(detectSystemLocale()).toBe('en');
  });
});
