// Exhaustive spec for NoteId.
//
// Mirrors DraftId — same UUID v4 contract. Kept as a separate spec because the
// brands are intentionally distinct: a draft id is not a note id, and a future
// refactor must not be allowed to weaken either contract without us noticing.
import { afterEach, describe, expect, it } from 'vitest';

import { DomainError } from '@domain/shared/DomainError';

import { InvalidNoteIdError, NoteId } from './NoteId';

const VALID = '550e8400-e29b-41d4-a716-446655440000';

describe('NoteId.create — accepted shapes', () => {
  it('accepts a canonical lowercase UUID v4', () => {
    const r = NoteId.create(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(VALID);
  });

  it.each([
    ['variant 8', '550e8400-e29b-41d4-8716-446655440000'],
    ['variant 9', '550e8400-e29b-41d4-9716-446655440000'],
    ['variant a', '550e8400-e29b-41d4-a716-446655440000'],
    ['variant b', '550e8400-e29b-41d4-b716-446655440000'],
  ])('accepts %s', (_label, value) => {
    expect(NoteId.create(value).ok).toBe(true);
  });
});

describe('NoteId.create — rejected shapes', () => {
  it.each([
    ['empty string', ''],
    ['plain non-UUID', 'not-a-uuid'],
    ['whitespace only', '   '],
    ['uppercase hex', '550E8400-E29B-41D4-A716-446655440000'],
    ['missing dashes', '550e8400e29b41d4a716446655440000'],
    ['too short (last group)', '550e8400-e29b-41d4-a716-44665544000'],
    ['too long (last group)', '550e8400-e29b-41d4-a716-4466554400000'],
    ['non-hex character', '550e8400-e29b-41d4-a716-44665544000z'],
    ['version 1', '550e8400-e29b-11d4-a716-446655440000'],
    ['version 3', '550e8400-e29b-31d4-a716-446655440000'],
    ['version 5', '550e8400-e29b-51d4-a716-446655440000'],
    ['variant digit out of range (c)', '550e8400-e29b-41d4-c716-446655440000'],
    ['surrounded by braces', '{550e8400-e29b-41d4-a716-446655440000}'],
    ['trailing newline', '550e8400-e29b-41d4-a716-446655440000\n'],
  ])('rejects %s', (_label, value) => {
    const r = NoteId.create(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidNoteIdError);
  });

  it('InvalidNoteIdError extends DomainError and exposes a stable code', () => {
    const r = NoteId.create('nope');
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(DomainError);
      expect(r.error.code).toBe('NOTE_ID_INVALID');
    }
  });

  it('the error message includes the offending value (developer-facing)', () => {
    const r = NoteId.create('xx-bad');
    if (!r.ok) expect(r.error.message).toContain('xx-bad');
  });
});

describe('NoteId.generate', () => {
  it('produces ids that pass create() (self-consistency)', () => {
    for (let i = 0; i < 25; i++) {
      const id = NoteId.generate();
      expect(NoteId.create(id).ok).toBe(true);
    }
  });

  it('produces distinct ids across many calls (collision check)', () => {
    const N = 100;
    const set = new Set<string>();
    for (let i = 0; i < N; i++) set.add(NoteId.generate());
    expect(set.size).toBe(N);
  });

  describe('runtime safety net', () => {
    const originalCrypto = (globalThis as { crypto?: unknown }).crypto;

    afterEach(() => {
      (globalThis as { crypto?: unknown }).crypto = originalCrypto;
    });

    it('throws when globalThis.crypto is missing entirely', () => {
      delete (globalThis as { crypto?: unknown }).crypto;
      expect(() => NoteId.generate()).toThrowError(/crypto\.randomUUID/);
    });

    it('throws when crypto exists but randomUUID is missing', () => {
      (globalThis as { crypto?: unknown }).crypto = {};
      expect(() => NoteId.generate()).toThrowError(/crypto\.randomUUID/);
    });
  });
});
