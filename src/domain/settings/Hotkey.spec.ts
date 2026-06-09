import { describe, expect, it } from 'vitest';

import { Hotkey, InvalidHotkeyError } from './Hotkey';

describe('Hotkey', () => {
  it('parses a canonical accelerator and round-trips it', () => {
    const result = Hotkey.create('CommandOrControl+Shift+Space');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accelerator).toBe('CommandOrControl+Shift+Space');
      expect(result.value.tokens()).toEqual(['CommandOrControl', 'Shift', 'Space']);
    }
  });

  it('accepts a single non-modifier token (e.g. a function key)', () => {
    const result = Hotkey.create('F1');
    expect(result.ok).toBe(true);
  });

  it('rejects an empty accelerator', () => {
    const result = Hotkey.create('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(InvalidHotkeyError);
  });

  it('rejects an unknown key token', () => {
    const result = Hotkey.create('CommandOrControl+WindowsKey');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/WindowsKey/);
  });

  it('rejects an accelerator that is only modifiers', () => {
    // The OS won't deliver "Shift" alone as a shortcut — must include a
    // non-modifier target key.
    const result = Hotkey.create('Shift+Command');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/non-modifier/);
  });

  it('rejects "++" or trailing "+"', () => {
    const r1 = Hotkey.create('CommandOrControl++Space');
    const r2 = Hotkey.create('CommandOrControl+Space+');
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it('builds from an ordered token list (UI capture path)', () => {
    const result = Hotkey.fromTokens(['CommandOrControl', 'Option', 'N']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.accelerator).toBe('CommandOrControl+Option+N');
  });

  it('classifies modifier tokens', () => {
    expect(Hotkey.isModifier('CommandOrControl')).toBe(true);
    expect(Hotkey.isModifier('Shift')).toBe(true);
    expect(Hotkey.isModifier('Space')).toBe(false);
    expect(Hotkey.isModifier('F1')).toBe(false);
  });

  it('considers two equal accelerators as equal values', () => {
    const a = Hotkey.create('CommandOrControl+K');
    const b = Hotkey.create('CommandOrControl+K');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.equals(b.value)).toBe(true);
  });
});
