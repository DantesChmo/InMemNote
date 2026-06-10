// Exhaustive spec for PaletteOverrides.
//
// Two invariants must never bend:
//   - every key must be in PALETTE_TOKEN_KEYS (a closed set the CSS layer
//     understands);
//   - every value must match HEX_COLOR_RE (#RGB, #RRGGBB, or #RRGGBBAA).
//
// On top of validation we pin immutability (with*/without* return new
// instances, originals untouched) and ordering (toOrderedPairs follows
// PALETTE_TOKEN_KEYS regardless of input order).

import { DomainError } from '@domain/shared/DomainError';
import { unwrap } from '@shared/Result';
import { describe, expect, it } from 'vitest';

import {
  InvalidPaletteColorError,
  InvalidPaletteTokenError,
  PALETTE_TOKEN_KEYS,
  PaletteOverrides,
} from './PaletteOverrides';

describe('PaletteOverrides.empty', () => {
  it('is empty and serializes to {}', () => {
    const e = PaletteOverrides.empty();
    expect(e.isEmpty()).toBe(true);
    expect(e.toJSON()).toEqual({});
    expect(e.toOrderedPairs()).toEqual([]);
  });

  it('reports has=false / get=undefined for every defined token', () => {
    const e = PaletteOverrides.empty();
    for (const key of PALETTE_TOKEN_KEYS) {
      expect(e.has(key)).toBe(false);
      expect(e.get(key)).toBeUndefined();
    }
  });
});

describe('PaletteOverrides.create — accepted input', () => {
  it.each(PALETTE_TOKEN_KEYS)('accepts known token "%s" with a 6-digit hex', (key) => {
    const r = PaletteOverrides.create({ [key]: '#aabbcc' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.has(key)).toBe(true);
      expect(r.value.get(key)).toBe('#aabbcc');
    }
  });

  it.each([
    ['shorthand #RGB', '#abc'],
    ['canonical #RRGGBB', '#aabbcc'],
    ['alpha #RRGGBBAA', '#aabbccdd'],
    ['uppercase hex digits', '#ABCDEF'],
    ['mixed case', '#aB12cD'],
    ['all zeros', '#000'],
    ['all fs', '#ffffff'],
  ])('accepts %s', (_label, hex) => {
    const r = PaletteOverrides.create({ accent: hex });
    expect(r.ok).toBe(true);
  });

  it('treats explicit `undefined` value as "no entry" (sparse map support)', () => {
    // The Partial<Record<...>> shape allows undefined values from spreads;
    // the parser must skip them rather than reject.
    const r = PaletteOverrides.create({ accent: undefined, panel: '#112233' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.has('accent')).toBe(false);
      expect(r.value.has('panel')).toBe(true);
    }
  });

  it('accepts an empty record', () => {
    const r = PaletteOverrides.create({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.isEmpty()).toBe(true);
  });

  it('accepts every token populated simultaneously', () => {
    const full: Record<string, string> = {};
    for (const key of PALETTE_TOKEN_KEYS) full[key] = '#abcdef';
    const r = PaletteOverrides.create(full);
    expect(r.ok).toBe(true);
    if (r.ok) {
      for (const key of PALETTE_TOKEN_KEYS) expect(r.value.has(key)).toBe(true);
    }
  });
});

describe('PaletteOverrides.create — rejected input', () => {
  it.each([
    ['unknown token "totally-unknown"', { 'totally-unknown': '#ffffff' }],
    ['camelCase variant of a known token', { Accent: '#ffffff' }],
    ['snake_case variant of a known token', { accent_ink: '#ffffff' }],
    ['numeric key', { 0: '#ffffff' }],
  ])('rejects %s with an InvalidPaletteTokenError', (_label, raw) => {
    const r = PaletteOverrides.create(raw as Record<string, string>);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidPaletteTokenError);
  });

  it.each([
    ['empty string', ''],
    ['no hash prefix', 'aabbcc'],
    ['too short (2 digits)', '#ab'],
    ['weird length (4 digits)', '#abcd'],
    ['weird length (5 digits)', '#abcde'],
    ['weird length (7 digits)', '#abcdef0'],
    ['non-hex char', '#zzz'],
    ['rgb() syntax', 'rgb(0,0,0)'],
    ['named color', 'red'],
    ['trailing whitespace', '#aabbcc '],
    ['leading whitespace', ' #aabbcc'],
    ['only hash', '#'],
  ])('rejects %s color with an InvalidPaletteColorError', (_label, value) => {
    const r = PaletteOverrides.create({ accent: value });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidPaletteColorError);
  });

  it('reports the bad token BEFORE the bad color when both are present (token check runs first)', () => {
    const r = PaletteOverrides.create({ 'totally-unknown': 'not-a-color' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidPaletteTokenError);
  });

  it('errors extend DomainError and carry stable codes', () => {
    const tokenErr = PaletteOverrides.create({ 'no-such-key': '#abc' });
    const colorErr = PaletteOverrides.create({ accent: 'red' });

    if (!tokenErr.ok) {
      expect(tokenErr.error).toBeInstanceOf(DomainError);
      expect(tokenErr.error.code).toBe('PALETTE_TOKEN_INVALID');
    }
    if (!colorErr.ok) {
      expect(colorErr.error).toBeInstanceOf(DomainError);
      expect(colorErr.error.code).toBe('PALETTE_COLOR_INVALID');
    }
  });
});

describe('PaletteOverrides.isValidColor', () => {
  it.each(['#abc', '#aabbcc', '#aabbccdd', '#ABCDEF', '#A1b2C3'])('accepts %s', (v) => {
    expect(PaletteOverrides.isValidColor(v)).toBe(true);
  });

  it.each(['', 'abc', '#zz0011', '#1', '#12', '#1234', '#1234567', '#123456789'])(
    'rejects %s',
    (v) => {
      expect(PaletteOverrides.isValidColor(v)).toBe(false);
    },
  );
});

describe('PaletteOverrides — immutability via withToken / withoutToken', () => {
  it('withToken returns a new instance; the original is unchanged', () => {
    const original = PaletteOverrides.empty();
    const next = original.withToken('accent', '#ffffff');
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(next.value).not.toBe(original);
      expect(original.has('accent')).toBe(false);
      expect(next.value.get('accent')).toBe('#ffffff');
    }
  });

  it('withToken with an invalid color returns Err and the original is untouched', () => {
    const original = unwrap(PaletteOverrides.create({ accent: '#000000' }));
    const r = original.withToken('accent', 'not-a-color');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidPaletteColorError);
    expect(original.get('accent')).toBe('#000000');
  });

  it('withToken on an existing key replaces the value', () => {
    const original = unwrap(PaletteOverrides.create({ accent: '#000000' }));
    const r = original.withToken('accent', '#ffffff');
    if (r.ok) expect(r.value.get('accent')).toBe('#ffffff');
  });

  it('withoutToken on a missing key returns the SAME instance (identity optimization)', () => {
    // Identity-equality matters here: callers that memoize on `===` won't
    // re-render needlessly when removing something that wasn't there.
    const original = PaletteOverrides.empty();
    expect(original.withoutToken('accent')).toBe(original);
  });

  it('withoutToken on a present key returns a new instance, original untouched', () => {
    const original = unwrap(PaletteOverrides.create({ accent: '#000000' }));
    const cleared = original.withoutToken('accent');
    expect(cleared).not.toBe(original);
    expect(cleared.has('accent')).toBe(false);
    expect(original.has('accent')).toBe(true);
  });

  it('withoutToken leaves siblings intact', () => {
    const original = unwrap(PaletteOverrides.create({ accent: '#000000', panel: '#ffffff' }));
    const cleared = original.withoutToken('accent');
    expect(cleared.has('accent')).toBe(false);
    expect(cleared.get('panel')).toBe('#ffffff');
  });
});

describe('PaletteOverrides — serialization and ordering', () => {
  it('toJSON returns a plain object matching the entries', () => {
    const overrides = unwrap(PaletteOverrides.create({ accent: '#abcdef', panel: '#123456' }));
    expect(overrides.toJSON()).toEqual({ accent: '#abcdef', panel: '#123456' });
  });

  it('toOrderedPairs follows PALETTE_TOKEN_KEYS, not insertion order', () => {
    // Insertion order would otherwise leak through Map iteration; we want a
    // stable, declarative order that matches the UI list.
    const overrides = unwrap(PaletteOverrides.create({
      text: '#111111',
      accent: '#222222',
    }));
    const ordered = overrides.toOrderedPairs().map((p) => p.key);
    const expected = PALETTE_TOKEN_KEYS.filter((k) => k === 'accent' || k === 'text');
    expect(ordered).toEqual(expected);
  });

  it('toOrderedPairs only emits keys that have a value (sparse-aware)', () => {
    const overrides = unwrap(PaletteOverrides.create({ panel: '#abcdef' }));
    expect(overrides.toOrderedPairs()).toEqual([{ key: 'panel', value: '#abcdef' }]);
  });

  it('toOrderedPairs is fully consistent with toJSON', () => {
    const raw: Record<string, string> = {};
    for (const key of PALETTE_TOKEN_KEYS) raw[key] = `#${key.length.toString(16).padStart(6, '0')}`;
    const overrides = unwrap(PaletteOverrides.create(raw));

    const pairs = overrides.toOrderedPairs();
    const json = overrides.toJSON();
    for (const { key, value } of pairs) {
      expect(json[key]).toBe(value);
    }
    expect(pairs.length).toBe(Object.keys(json).length);
  });
});

describe('PaletteOverrides.isEmpty', () => {
  it('is true for an empty instance', () => {
    expect(PaletteOverrides.empty().isEmpty()).toBe(true);
  });

  it('is false once at least one entry is set', () => {
    const o = unwrap(PaletteOverrides.create({ accent: '#ffffff' }));
    expect(o.isEmpty()).toBe(false);
  });

  it('is true again after the last entry is removed', () => {
    const o = unwrap(PaletteOverrides.create({ accent: '#ffffff' }));
    expect(o.withoutToken('accent').isEmpty()).toBe(true);
  });
});
