// Exhaustive spec for ThemeMode.
//
// Tiny VO, but it's a closed enum that gates which CSS variables the renderer
// applies. A silent widening (e.g. "auto" sneaking in) would cause a class of
// "looks wrong on launch" bugs we never want.
import { describe, expect, it } from 'vitest';

import { DomainError } from '@domain/shared/DomainError';

import { InvalidThemeModeError, ThemeMode } from './ThemeMode';

describe('ThemeMode — accepted values', () => {
  it.each(['system', 'dark', 'light'] as const)('accepts %s', (v) => {
    const r = ThemeMode.create(v);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(v);
  });
});

describe('ThemeMode — rejected values', () => {
  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['unknown identifier', 'paper-white'],
    ['plausible but unsupported', 'auto'],
    ['uppercase (case-sensitive)', 'Dark'],
    ['surrounding whitespace', ' dark '],
    ['close-but-wrong', 'darkmode'],
  ])('rejects %s', (_label, value) => {
    const r = ThemeMode.create(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidThemeModeError);
  });

  it('error extends DomainError and carries a stable code', () => {
    const r = ThemeMode.create('xxx');
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(DomainError);
      expect(r.error.code).toBe('THEME_MODE_INVALID');
      expect(r.error.message).toContain('xxx');
    }
  });
});

describe('ThemeMode — metadata', () => {
  it('default() is "system" (OS-driven)', () => {
    expect(ThemeMode.default()).toBe('system');
  });

  it('values() returns exactly the accepted set in declaration order', () => {
    expect(ThemeMode.values()).toEqual(['system', 'dark', 'light']);
  });

  it('values() and create() agree — round-trip every entry', () => {
    for (const v of ThemeMode.values()) {
      expect(ThemeMode.create(v).ok).toBe(true);
    }
  });
});
