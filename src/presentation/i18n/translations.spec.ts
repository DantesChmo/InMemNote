import { describe, expect, it } from 'vitest';

import { en } from './translations.en';
import { ru } from './translations.ru';

const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

// TypeScript already forces both catalogs to have the same keys; what it cannot
// see is a translation that drops or renames a `{param}` — `t()` would then
// silently ignore the argument (or print a raw `{name}`) in only one language.
describe('translation catalogs', () => {
  it('have the same keys', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it('use the same placeholders in every language', () => {
    const mismatches = Object.keys(en)
      .filter((k) => {
        const key = k as keyof typeof en;
        return placeholders(en[key]).join() !== placeholders(ru[key]).join();
      })
      .map(
        (k) =>
          `${k}: en=${placeholders(en[k as keyof typeof en])} ru=${placeholders(ru[k as keyof typeof ru])}`,
      );
    expect(mismatches).toEqual([]);
  });

  it('have no empty strings', () => {
    for (const dict of [en, ru]) {
      const empty = Object.entries(dict).filter(([, v]) => v.trim() === '');
      expect(empty).toEqual([]);
    }
  });
});
