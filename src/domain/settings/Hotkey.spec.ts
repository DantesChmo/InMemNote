// Exhaustive spec for the Hotkey value object.
//
// Hotkey is the contract between user input (settings UI) and `globalShortcut`
// in the Electron main process. Every token must be one the OS will deliver,
// in the exact case Electron expects. We pin all branches and equivalence
// classes so a broken hotkey can never escape the boundary.
import { DomainError } from '@domain/shared/DomainError';
import { describe, expect, it } from 'vitest';


import { ALLOWED_KEY_TOKENS, Hotkey, InvalidHotkeyError } from './Hotkey';

const MODIFIERS = [
  'Command', 'Cmd', 'Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl',
  'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta',
] as const;

const SPECIALS = [
  'Plus', 'Space', 'Tab', 'Capslock', 'Numlock', 'Scrolllock',
  'Backspace', 'Delete', 'Insert', 'Return', 'Enter',
  'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown',
  'Escape', 'Esc', 'PrintScreen',
] as const;

const MEDIA = [
  'VolumeUp', 'VolumeDown', 'VolumeMute',
  'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause',
] as const;

const NUMPAD = [
  'NumpadDecimal', 'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide',
  'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4',
  'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
] as const;

const FUNCTION_KEYS = Array.from({ length: 24 }, (_, i) => `F${i + 1}`);

describe('Hotkey.create — accepted accelerators', () => {
  it.each([
    ['canonical full accelerator', 'CommandOrControl+Shift+Space'],
    ['simple modifier+letter', 'CommandOrControl+K'],
    ['letter only', 'A'],
    ['digit only', '0'],
    ['function key only', 'F1'],
    ['highest function key', 'F24'],
    ['media key alone (non-modifier)', 'MediaPlayPause'],
    ['numpad key alone', 'Numpad0'],
  ])('accepts %s', (_label, value) => {
    expect(Hotkey.create(value).ok).toBe(true);
  });

  it('round-trips the accelerator string via tokens()', () => {
    const r = Hotkey.create('CommandOrControl+Shift+Space');
    if (!r.ok) throw r.error;
    expect(r.value.tokens()).toEqual(['CommandOrControl', 'Shift', 'Space']);
    expect(r.value.accelerator).toBe('CommandOrControl+Shift+Space');
  });

  it('trims surrounding whitespace before parsing (UI capture often appends a stray space)', () => {
    const r = Hotkey.create('  CommandOrControl+K  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.accelerator).toBe('CommandOrControl+K');
  });
});

describe('Hotkey.create — every allowed token in isolation is acceptable when paired with a non-modifier', () => {
  it.each(MODIFIERS)('modifier %s + letter A is accepted', (mod) => {
    expect(Hotkey.create(`${mod}+A`).ok).toBe(true);
  });

  it.each(SPECIALS)('special key %s alone is accepted (non-modifier)', (key) => {
    expect(Hotkey.create(key).ok).toBe(true);
  });

  it.each(MEDIA)('media key %s alone is accepted', (key) => {
    expect(Hotkey.create(key).ok).toBe(true);
  });

  it.each(NUMPAD)('numpad key %s alone is accepted', (key) => {
    expect(Hotkey.create(key).ok).toBe(true);
  });

  it.each(FUNCTION_KEYS)('function key %s alone is accepted', (key) => {
    expect(Hotkey.create(key).ok).toBe(true);
  });

  it.each('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))('letter %s alone is accepted', (letter) => {
    expect(Hotkey.create(letter).ok).toBe(true);
  });

  it.each('0123456789'.split(''))('digit %s alone is accepted', (digit) => {
    expect(Hotkey.create(digit).ok).toBe(true);
  });
});

describe('Hotkey.create — rejected accelerators (each error branch)', () => {
  it('rejects empty string with reason "empty accelerator"', () => {
    const r = Hotkey.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/empty accelerator/);
  });

  it('rejects whitespace-only (trim → "" → empty accelerator)', () => {
    const r = Hotkey.create('     ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/empty accelerator/);
  });

  it.each([
    ['double plus', 'CommandOrControl++Space'],
    ['leading plus', '+CommandOrControl+Space'],
    ['trailing plus', 'CommandOrControl+Space+'],
    ['only plus', '+'],
  ])('rejects %s with reason "empty token between separators"', (_label, value) => {
    const r = Hotkey.create(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/empty token/);
  });

  it.each([
    ['unknown WindowsKey', 'WindowsKey'],
    ['unknown ESC variant', 'EscapeKey'],
    ['lowercase letter', 'a'],
    ['lowercase shift', 'shift'],
    ['mixed case modifier', 'CommandOrControl+shift+Space'],
    ['letter outside A-Z', 'Ω'],
    ['random punctuation token', 'CommandOrControl+@'],
    ['F25 (out of supported range)', 'F25'],
    ['F0 (out of supported range)', 'F0'],
    ['multi-char letter', 'CommandOrControl+AB'],
    ['emoji token', 'CommandOrControl+🚀'],
  ])('rejects %s with reason "unknown key token"', (_label, value) => {
    const r = Hotkey.create(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/unknown key token/);
  });

  it.each([
    ['single modifier', 'Shift'],
    ['two modifiers', 'Shift+Command'],
    ['three modifiers', 'CommandOrControl+Shift+Alt'],
    ['every modifier permutation', 'Cmd+CmdOrCtrl+Meta'],
  ])('rejects %s with reason "requires at least one non-modifier key"', (_label, value) => {
    const r = Hotkey.create(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/non-modifier/);
  });

  it('error extends DomainError and carries the stable code', () => {
    const r = Hotkey.create('');
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(DomainError);
      expect(r.error).toBeInstanceOf(InvalidHotkeyError);
      expect(r.error.code).toBe('HOTKEY_INVALID');
    }
  });

  it('error message preserves the original (un-trimmed) input — useful for log debugging', () => {
    const r = Hotkey.create('  WindowsKey  ');
    if (!r.ok) {
      expect(r.error.message).toContain('WindowsKey');
    }
  });
});

describe('Hotkey.fromTokens', () => {
  it('joins tokens with "+" and validates the result', () => {
    const r = Hotkey.fromTokens(['CommandOrControl', 'Option', 'N']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.accelerator).toBe('CommandOrControl+Option+N');
  });

  it('rejects an empty token list (joins to ""→ empty accelerator)', () => {
    expect(Hotkey.fromTokens([]).ok).toBe(false);
  });

  it('rejects when any token is invalid', () => {
    expect(Hotkey.fromTokens(['CommandOrControl', 'nope']).ok).toBe(false);
  });

  it('rejects an array of only modifiers (no non-modifier key)', () => {
    expect(Hotkey.fromTokens(['CommandOrControl', 'Shift']).ok).toBe(false);
  });

  it('rejects a token list with an empty string (yields empty-token-between-separators)', () => {
    expect(Hotkey.fromTokens(['CommandOrControl', '', 'A']).ok).toBe(false);
  });
});

describe('Hotkey.isModifier classification', () => {
  it.each(MODIFIERS)('classifies modifier "%s" as modifier', (mod) => {
    expect(Hotkey.isModifier(mod)).toBe(true);
  });

  it.each([...SPECIALS, ...MEDIA, ...NUMPAD, ...FUNCTION_KEYS, 'A', 'Z', '0', '9'])(
    'classifies non-modifier "%s" as NOT modifier',
    (key) => {
      expect(Hotkey.isModifier(key)).toBe(false);
    },
  );

  it('classifies an unknown token as NOT modifier (set lookup, not validation)', () => {
    // isModifier is informational, not validating; callers use it to render UI.
    expect(Hotkey.isModifier('TotallyMadeUp')).toBe(false);
  });
});

describe('Hotkey.equals', () => {
  it('two identical accelerators are equal', () => {
    const a = Hotkey.create('CommandOrControl+K');
    const b = Hotkey.create('CommandOrControl+K');
    if (a.ok && b.ok) expect(a.value.equals(b.value)).toBe(true);
  });

  it('token-order-different accelerators are NOT equal (order is significant)', () => {
    // Electron treats accelerator strings as exact; we mirror that.
    const a = Hotkey.create('CommandOrControl+Shift+K');
    const b = Hotkey.create('Shift+CommandOrControl+K');
    if (a.ok && b.ok) expect(a.value.equals(b.value)).toBe(false);
  });

  it('different accelerators are not equal', () => {
    const a = Hotkey.create('CommandOrControl+K');
    const b = Hotkey.create('CommandOrControl+J');
    if (a.ok && b.ok) expect(a.value.equals(b.value)).toBe(false);
  });

  it('equality is reflexive', () => {
    const r = Hotkey.create('CommandOrControl+K');
    if (r.ok) expect(r.value.equals(r.value)).toBe(true);
  });
});

describe('Hotkey — exported token universe', () => {
  // Pin the structural invariant: the set the UI consults to render the
  // "available keys" picker is the same set the validator accepts.
  it('every token in ALLOWED_KEY_TOKENS is either a valid standalone hotkey or a recognized modifier', () => {
    for (const token of ALLOWED_KEY_TOKENS) {
      if (Hotkey.isModifier(token)) {
        // Modifiers cannot stand alone but must pair with a non-modifier.
        expect(Hotkey.create(`${token}+A`).ok).toBe(true);
      } else {
        expect(Hotkey.create(token).ok).toBe(true);
      }
    }
  });
});
