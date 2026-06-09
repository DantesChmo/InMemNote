// Exhaustive spec for LanguageMode.
//
// LanguageMode mirrors ThemeMode and gates which translation dictionary the
// renderer picks. A silent widening (a random "fr" code accepted but with no
// dictionary shipped) would crash useTranslation at first key lookup.
import { describe, expect, it } from 'vitest';

import { DomainError } from '@domain/shared/DomainError';

import { InvalidLanguageModeError, LanguageMode, SUPPORTED_LOCALES } from './LanguageMode';

describe('LanguageMode — accepted values', () => {
  it.each(['system', ...SUPPORTED_LOCALES])('accepts %s', (v) => {
    const r = LanguageMode.create(v);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(v);
  });
});

describe('LanguageMode — rejected values', () => {
  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['unknown locale (fr)', 'fr'],
    ['plausible alias (eng)', 'eng'],
    ['uppercase (case-sensitive)', 'EN'],
    ['surrounding whitespace', ' en '],
    ['BCP-47 with region', 'en-US'],
    ['close-but-wrong', 'system-ru'],
  ])('rejects %s', (_label, value) => {
    const r = LanguageMode.create(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidLanguageModeError);
  });

  it('error extends DomainError and carries a stable code + offending value', () => {
    const r = LanguageMode.create('xxx');
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(DomainError);
      expect(r.error.code).toBe('LANGUAGE_MODE_INVALID');
      expect(r.error.message).toContain('xxx');
    }
  });
});

describe('LanguageMode — metadata', () => {
  it('default() is "system"', () => {
    expect(LanguageMode.default()).toBe('system');
  });

  it('values() is "system" plus every supported locale, in declaration order', () => {
    expect(LanguageMode.values()).toEqual(['system', ...SUPPORTED_LOCALES]);
  });

  it('SUPPORTED_LOCALES drives values() — adding/removing a locale propagates', () => {
    // Pin the structural relationship: every supported locale appears in values()
    // after "system". This is the contract translations.<code>.ts files rely on.
    expect(LanguageMode.values()).toEqual(expect.arrayContaining([...SUPPORTED_LOCALES]));
    expect(LanguageMode.values()[0]).toBe('system');
  });

  it('values() and create() agree — round-trip every entry', () => {
    for (const v of LanguageMode.values()) {
      expect(LanguageMode.create(v).ok).toBe(true);
    }
  });
});
