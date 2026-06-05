import { describe, expect, it } from 'vitest';

import { NoteContent, NoteContentTooLargeError } from './NoteContent';

describe('NoteContent', () => {
  it('treats an empty string as valid', () => {
    const r = NoteContent.create('');
    expect(r.ok).toBe(true);
  });

  it('reports `isEmpty` for whitespace-only content', () => {
    const c = NoteContent.empty();
    expect(c.isEmpty()).toBe(true);
    const r = NoteContent.create('   \n\t  ');
    if (r.ok) expect(r.value.isEmpty()).toBe(true);
  });

  it('rejects content exceeding the size cap', () => {
    const huge = 'a'.repeat(NoteContent.MAX_LENGTH + 1);
    const r = NoteContent.create(huge);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(NoteContentTooLargeError);
  });

  it('considers same-text contents equal', () => {
    const a = NoteContent.create('hello');
    const b = NoteContent.create('hello');
    if (a.ok && b.ok) expect(a.value.equals(b.value)).toBe(true);
  });
});
