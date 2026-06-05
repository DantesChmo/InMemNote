import { describe, expect, it } from 'vitest';

import { DraftId, InvalidDraftIdError } from './DraftId';

describe('DraftId', () => {
  it('accepts a canonical UUID v4', () => {
    const v4 = '550e8400-e29b-41d4-a716-446655440000';
    const r = DraftId.create(v4);
    expect(r.ok).toBe(true);
  });

  it('rejects strings that are not UUID v4', () => {
    const r = DraftId.create('not-a-uuid');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidDraftIdError);
  });

  it('generates ids that pass its own validator', () => {
    const id = DraftId.generate();
    const round = DraftId.create(id);
    expect(round.ok).toBe(true);
  });
});
