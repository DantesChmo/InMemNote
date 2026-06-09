import { describe, expect, it } from 'vitest';

import { InvalidLanguageModeError, LanguageMode, SUPPORTED_LOCALES } from './LanguageMode';

describe('LanguageMode', () => {
  it('accepts every supported locale plus "system"', () => {
    for (const v of ['system', ...SUPPORTED_LOCALES]) {
      const result = LanguageMode.create(v);
      expect(result.ok).toBe(true);
    }
  });

  it('rejects an unknown locale with a domain error', () => {
    const result = LanguageMode.create('fr');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InvalidLanguageModeError);
      expect(result.error.code).toBe('LANGUAGE_MODE_INVALID');
    }
  });

  it('defaults to "system" — the OS-driven mode', () => {
    expect(LanguageMode.default()).toBe('system');
  });
});
