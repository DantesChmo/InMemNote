// Exhaustive spec for NoteContent.
//
// NoteContent is a value object with two invariants:
//   - length cap (MAX_LENGTH UTF-16 code units);
//   - whitespace-only content counts as "empty" for autosave skip purposes.
//
// We pin both invariants at their boundaries, plus the equality contract and
// the error shape (code/message), since the persistence layer relies on
// `code` to react to corrupted rows.
import { describe, expect, it } from 'vitest';

import { DomainError } from '@domain/shared/DomainError';

import { NoteContent, NoteContentTooLargeError } from './NoteContent';

const MAX = NoteContent.MAX_LENGTH;

describe('NoteContent — accepted content', () => {
  it('accepts the empty string', () => {
    expect(NoteContent.create('').ok).toBe(true);
  });

  it('accepts a single character', () => {
    const r = NoteContent.create('a');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('a');
  });

  it('accepts content exactly at the length cap (boundary, inclusive)', () => {
    const r = NoteContent.create('a'.repeat(MAX));
    expect(r.ok).toBe(true);
  });

  it('preserves the value byte-for-byte (no normalization, no trimming)', () => {
    // Important: the editor sends back literally what the user typed. If
    // create() trimmed leading whitespace, autosave would diverge from the
    // visible text — silent data loss.
    const raw = '  leading and trailing   \n  ';
    const r = NoteContent.create(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe(raw);
  });

  it('accepts unicode (surrogate pairs / emoji) under the cap', () => {
    // The cap is in UTF-16 code units. An emoji like 🎉 is 2 units.
    const emoji = '🎉'; // length 2
    const fits = emoji.repeat(Math.floor(MAX / emoji.length));
    expect(fits.length).toBeLessThanOrEqual(MAX);
    const r = NoteContent.create(fits);
    expect(r.ok).toBe(true);
  });
});

describe('NoteContent — rejected content', () => {
  it('rejects content one character over the cap (boundary, exclusive)', () => {
    const r = NoteContent.create('a'.repeat(MAX + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(NoteContentTooLargeError);
      expect(r.error).toBeInstanceOf(DomainError);
    }
  });

  it('NoteContentTooLargeError carries a stable machine-readable code', () => {
    const r = NoteContent.create('a'.repeat(MAX + 1));
    if (!r.ok) {
      // Code is part of the persistence contract — never change without
      // bumping the storage schema version.
      expect(r.error.code).toBe('NOTE_CONTENT_TOO_LARGE');
    }
  });

  it('NoteContentTooLargeError message reports both the actual and the maximum length', () => {
    const oversized = 'a'.repeat(MAX + 1);
    const r = NoteContent.create(oversized);
    if (!r.ok) {
      expect(r.error.message).toContain(String(oversized.length));
      expect(r.error.message).toContain(String(MAX));
    }
  });

  it('rejects content even if the surplus consists of trailing whitespace (no implicit trim)', () => {
    // Trimming inside `create` would mask the cap and let pathological inputs
    // through. Document that whitespace counts against the limit.
    const r = NoteContent.create('a'.repeat(MAX) + ' ');
    expect(r.ok).toBe(false);
  });
});

describe('NoteContent.empty', () => {
  it('returns an instance whose value is ""', () => {
    expect(NoteContent.empty().value).toBe('');
  });

  it('reports isEmpty true', () => {
    expect(NoteContent.empty().isEmpty()).toBe(true);
  });
});

describe('NoteContent.isEmpty — whitespace-only equivalence class', () => {
  // Per the JSDoc on isEmpty, whitespace-only is treated as empty so autosave
  // doesn't accumulate junk drafts when the user opens the panel by accident.
  it.each([
    ['empty string', ''],
    ['single space', ' '],
    ['multiple spaces', '     '],
    ['tab', '\t'],
    ['newline', '\n'],
    ['carriage return', '\r'],
    ['mixed whitespace', '  \n\t  \r\n   '],
  ])('reports isEmpty for %s', (_label, value) => {
    const r = NoteContent.create(value);
    if (!r.ok) throw r.error;
    expect(r.value.isEmpty()).toBe(true);
  });

  it.each([
    ['letter', 'a'],
    ['letter with surrounding whitespace', '  a  '],
    ['digit', '0'],
    ['emoji', '🎉'],
    ['punctuation', '.'],
  ])('reports NOT isEmpty for %s', (_label, value) => {
    const r = NoteContent.create(value);
    if (!r.ok) throw r.error;
    expect(r.value.isEmpty()).toBe(false);
  });
});

describe('NoteContent.equals — equality contract', () => {
  function make(s: string): NoteContent {
    const r = NoteContent.create(s);
    if (!r.ok) throw r.error;
    return r.value;
  }

  it('is reflexive: x.equals(x) is true', () => {
    const x = make('hello');
    expect(x.equals(x)).toBe(true);
  });

  it('is symmetric: x.equals(y) iff y.equals(x)', () => {
    const a = make('hello');
    const b = make('hello');
    expect(a.equals(b)).toBe(true);
    expect(b.equals(a)).toBe(true);
  });

  it('is transitive when values agree', () => {
    const a = make('hello');
    const b = make('hello');
    const c = make('hello');
    expect(a.equals(b) && b.equals(c) && a.equals(c)).toBe(true);
  });

  it('distinguishes case (no case-insensitive normalization)', () => {
    expect(make('Hello').equals(make('hello'))).toBe(false);
  });

  it('distinguishes whitespace — visually-similar strings are not equal', () => {
    expect(make('hello').equals(make('hello '))).toBe(false);
    expect(make('hello').equals(make(' hello'))).toBe(false);
  });

  it('treats two empty contents as equal', () => {
    expect(NoteContent.empty().equals(NoteContent.empty())).toBe(true);
  });

  it('treats empty and whitespace-only as NOT equal (even though both are isEmpty)', () => {
    // isEmpty is a UX heuristic for "blank-looking". equals is byte-exact.
    // Conflating them would let autosave silently mutate user content.
    expect(NoteContent.empty().equals(make('   '))).toBe(false);
  });
});
