import { describe, expect, it } from 'vitest';

import { InvalidThemeModeError, ThemeMode } from './ThemeMode';

describe('ThemeMode', () => {
  it('accepts the three canonical values', () => {
    for (const v of ['system', 'dark', 'light'] as const) {
      const result = ThemeMode.create(v);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(v);
    }
  });

  it('rejects unknown strings with a domain error', () => {
    const result = ThemeMode.create('paper-white');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InvalidThemeModeError);
      expect(result.error.code).toBe('THEME_MODE_INVALID');
    }
  });

  it('defaults to "system" — the OS-driven mode', () => {
    expect(ThemeMode.default()).toBe('system');
  });
});
