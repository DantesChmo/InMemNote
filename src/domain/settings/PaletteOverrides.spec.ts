import { describe, expect, it } from 'vitest';

import {
  InvalidPaletteColorError,
  InvalidPaletteTokenError,
  PALETTE_TOKEN_KEYS,
  PaletteOverrides,
} from './PaletteOverrides';

describe('PaletteOverrides', () => {
  it('starts empty', () => {
    const empty = PaletteOverrides.empty();
    expect(empty.isEmpty()).toBe(true);
    expect(empty.toJSON()).toEqual({});
  });

  it('accepts a valid sparse map', () => {
    const result = PaletteOverrides.create({ accent: '#abcdef', panel: '#112233' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.get('accent')).toBe('#abcdef');
      expect(result.value.get('panel')).toBe('#112233');
      expect(result.value.has('text')).toBe(false);
    }
  });

  it('rejects an unknown token key', () => {
    const result = PaletteOverrides.create({ 'totally-unknown': '#ffffff' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(InvalidPaletteTokenError);
  });

  it('rejects a malformed color', () => {
    const result = PaletteOverrides.create({ accent: 'rgb(0,0,0)' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(InvalidPaletteColorError);
  });

  it('accepts #RRGGBBAA (8-digit hex with alpha)', () => {
    const result = PaletteOverrides.create({ accent: '#ff000080' });
    expect(result.ok).toBe(true);
  });

  it('returns a new override on edit (immutable)', () => {
    const a = PaletteOverrides.empty();
    const b = a.withToken('accent', '#ffffff');
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(a.has('accent')).toBe(false);
      expect(b.value.get('accent')).toBe('#ffffff');
    }
  });

  it('rejects an invalid color via the per-token setter', () => {
    const a = PaletteOverrides.empty();
    const b = a.withToken('accent', 'not-a-color');
    expect(b.ok).toBe(false);
  });

  it('clears a token via withoutToken', () => {
    const start = PaletteOverrides.create({ accent: '#000000', panel: '#ffffff' });
    expect(start.ok).toBe(true);
    if (start.ok) {
      const cleared = start.value.withoutToken('accent');
      expect(cleared.has('accent')).toBe(false);
      expect(cleared.get('panel')).toBe('#ffffff');
    }
  });

  it('orders pairs by PALETTE_TOKEN_KEYS for stable UI rendering', () => {
    const start = PaletteOverrides.create({
      text: '#111111',
      accent: '#222222',
    });
    expect(start.ok).toBe(true);
    if (start.ok) {
      const ordered = start.value.toOrderedPairs().map((p) => p.key);
      // `accent` precedes `text` in the canonical order.
      expect(ordered.indexOf('accent')).toBeLessThan(ordered.indexOf('text'));
      // Order matches the keys list exactly for the entries present.
      const expected = PALETTE_TOKEN_KEYS.filter((k) => k === 'accent' || k === 'text');
      expect(ordered).toEqual(expected);
    }
  });

  it('validates hex colors via the static helper', () => {
    expect(PaletteOverrides.isValidColor('#abc')).toBe(true);
    expect(PaletteOverrides.isValidColor('#aabbcc')).toBe(true);
    expect(PaletteOverrides.isValidColor('#aabbccdd')).toBe(true);
    expect(PaletteOverrides.isValidColor('abc')).toBe(false);
    expect(PaletteOverrides.isValidColor('#zz0011')).toBe(false);
  });
});
