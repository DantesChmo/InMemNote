// Exhaustive spec for DraftId.
//
// The brand is enforced at compile time. The runtime contract is the regex:
//   /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
// — lowercase hex, version digit literally "4", variant digit in {8,9,a,b}.
//
// We pin every equivalence class so a future refactor (e.g. switching to a
// uuid library) cannot widen or narrow the accepted set silently.
import { DomainError } from '@domain/shared/DomainError';
import { afterEach, describe, expect, it } from 'vitest';


import { DraftId, InvalidDraftIdError } from './DraftId';

const VALID = '550e8400-e29b-41d4-a716-446655440000';

describe('DraftId.create — accepted shapes', () => {
  it('accepts a canonical lowercase UUID v4', () => {
    const r = DraftId.create(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(VALID);
  });

  it.each([
    // (label, variant-digit) — only 8,9,a,b are valid v4 variants.
    ['variant 8', '550e8400-e29b-41d4-8716-446655440000'],
    ['variant 9', '550e8400-e29b-41d4-9716-446655440000'],
    ['variant a', '550e8400-e29b-41d4-a716-446655440000'],
    ['variant b', '550e8400-e29b-41d4-b716-446655440000'],
  ])('accepts %s', (_label, value) => {
    expect(DraftId.create(value).ok).toBe(true);
  });
});

describe('DraftId.create — rejected shapes', () => {
  it.each([
    ['empty string', ''],
    ['plain non-UUID', 'not-a-uuid'],
    ['whitespace only', '   '],
    ['leading whitespace', ' 550e8400-e29b-41d4-a716-446655440000'],
    ['trailing whitespace', '550e8400-e29b-41d4-a716-446655440000 '],
    ['trailing newline', '550e8400-e29b-41d4-a716-446655440000\n'],
    ['uppercase hex', '550E8400-E29B-41D4-A716-446655440000'],
    ['missing dashes', '550e8400e29b41d4a716446655440000'],
    ['too short (last group)', '550e8400-e29b-41d4-a716-44665544000'],
    ['too long (last group)', '550e8400-e29b-41d4-a716-4466554400000'],
    ['non-hex character', '550e8400-e29b-41d4-a716-44665544000z'],
    ['version 1', '550e8400-e29b-11d4-a716-446655440000'],
    ['version 3', '550e8400-e29b-31d4-a716-446655440000'],
    ['version 5', '550e8400-e29b-51d4-a716-446655440000'],
    ['variant digit out of range (c)', '550e8400-e29b-41d4-c716-446655440000'],
    ['variant digit out of range (7)', '550e8400-e29b-41d4-7716-446655440000'],
    ['surrounded by braces', '{550e8400-e29b-41d4-a716-446655440000}'],
  ])('rejects %s', (_label, value) => {
    const r = DraftId.create(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidDraftIdError);
  });

  it('InvalidDraftIdError extends DomainError and exposes a stable code', () => {
    const r = DraftId.create('nope');
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(DomainError);
      expect(r.error.code).toBe('DRAFT_ID_INVALID');
    }
  });

  it('the error message includes the offending value', () => {
    const r = DraftId.create('xx-bad');
    if (!r.ok) expect(r.error.message).toContain('xx-bad');
  });
});

describe('DraftId.generate', () => {
  it('produces ids that pass create() (self-consistency)', () => {
    for (let i = 0; i < 25; i++) {
      const id = DraftId.generate();
      expect(DraftId.create(id).ok).toBe(true);
    }
  });

  it('produces distinct ids across many calls (collision check)', () => {
    const N = 100;
    const set = new Set<string>();
    for (let i = 0; i < N; i++) set.add(DraftId.generate());
    expect(set.size).toBe(N);
  });

  describe('runtime safety net', () => {
    // The factory throws (not returns Err) when crypto.randomUUID is missing,
    // because that's a broken runtime, not a domain failure. Pin both branches.
    const originalCrypto = (globalThis as { crypto?: unknown }).crypto;

    afterEach(() => {
      (globalThis as { crypto?: unknown }).crypto = originalCrypto;
    });

    it('throws when globalThis.crypto is missing entirely', () => {
      delete (globalThis as { crypto?: unknown }).crypto;
      expect(() => DraftId.generate()).toThrowError(/crypto\.randomUUID/);
    });

    it('throws when crypto exists but randomUUID is missing', () => {
      (globalThis as { crypto?: unknown }).crypto = {};
      expect(() => DraftId.generate()).toThrowError(/crypto\.randomUUID/);
    });
  });
});
