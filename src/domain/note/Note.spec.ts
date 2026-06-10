// Exhaustive spec for the Note aggregate.
//
// `Note` is the library counterpart to `DraftNote`. The two differ in lifecycle,
// not shape — Note has many instances, Draft has one — but the command
// semantics (no-op guards, updatedAt monotonicity, immutable createdAt/id) must
// stay aligned because the same UI mental model drives both. If a refactor
// diverges them silently, users see "list reorder for no reason" bugs.
//
// We also pin `title()` exhaustively because the library card is rendered from
// it; the regex inside is small but each branch matters for the visible UI.

import { NoteContent } from '@domain/draft/NoteContent';
import { unwrap } from '@shared/Result';
import { describe, expect, it } from 'vitest';

import { Note } from './Note';
import { NoteId } from './NoteId';

const T0 = new Date('2026-01-01T00:00:00.000Z');
const T1 = new Date('2026-01-01T00:01:00.000Z');
const T2 = new Date('2026-01-01T00:02:00.000Z');

function makeWithBody(body: string): Note {
  return Note.create(unwrap(NoteContent.create(body)), T0);
}

describe('Note.create', () => {
  it('stamps both timestamps to the supplied now, starts unpinned', () => {
    const note = makeWithBody('hello');
    expect(note.createdAt).toBe(T0);
    expect(note.updatedAt).toBe(T0);
    expect(note.pinned).toBe(false);
    expect(note.content.value).toBe('hello');
  });

  it('assigns a NoteId that passes its own validator', () => {
    const note = makeWithBody('x');
    expect(NoteId.create(note.id).ok).toBe(true);
  });

  it('two creations produce distinct ids', () => {
    const a = makeWithBody('a');
    const b = makeWithBody('b');
    expect(a.id).not.toBe(b.id);
  });
});

describe('Note.restore', () => {
  it('preserves every field exactly as supplied', () => {
    const id = unwrap(NoteId.create('550e8400-e29b-41d4-a716-446655440000'));
    const c = unwrap(NoteContent.create('body'));
    const note = Note.restore({
      id,
      content: c,
      pinned: true,
      createdAt: T0,
      updatedAt: T1,
    });
    expect(note.id).toBe(id);
    expect(note.content).toBe(c);
    expect(note.pinned).toBe(true);
    expect(note.createdAt).toBe(T0);
    expect(note.updatedAt).toBe(T1);
  });
});

describe('Note.title — derivation', () => {
  // The regex inside title() strips one marker per line, trims, and stops at
  // the first non-empty result. We pin each equivalence class so a refactor
  // touching the regex cannot silently break the library card.

  describe('heading markers (#…)', () => {
    it.each([
      ['# Heading', 'Heading'],
      ['## Heading', 'Heading'],
      ['### Heading', 'Heading'],
      ['#### Heading', 'Heading'],
      ['##### Heading', 'Heading'],
      ['###### Heading', 'Heading'],
    ])('strips 1–6 hashes: %s → %s', (input, expected) => {
      expect(makeWithBody(input).title()).toBe(expected);
    });

    it('does NOT strip seven hashes — the regex requires whitespace after 1–6 hashes', () => {
      // ####### Heading: any 1–6 prefix is followed by '#', never whitespace,
      // so no match → no stripping → trim leaves the literal string.
      expect(makeWithBody('####### Heading').title()).toBe('####### Heading');
    });

    it('does NOT strip a hash followed by no whitespace', () => {
      expect(makeWithBody('#NotAHeading').title()).toBe('#NotAHeading');
    });
  });

  describe('list and quote markers', () => {
    it.each([
      ['- item', 'item'],
      ['* item', 'item'],
      ['+ item', 'item'],
      ['1. first', 'first'],
      ['12. twelfth', 'twelfth'],
      ['1) one', 'one'],
      ['> quote', 'quote'],
    ])('strips %s → %s', (input, expected) => {
      expect(makeWithBody(input).title()).toBe(expected);
    });

    it('a marker without trailing whitespace is NOT stripped', () => {
      // `^>\s+` requires a space; `>noSpace` doesn't match and is kept as-is.
      expect(makeWithBody('>noSpace').title()).toBe('>noSpace');
    });
  });

  describe('line selection', () => {
    it('returns the first non-empty line, skipping blank/whitespace-only lines', () => {
      expect(makeWithBody('\n   \n\n\tactual title\nbody').title()).toBe('actual title');
    });

    it('falls through to the next line when the first is "marker-only" (strip → empty)', () => {
      // '#  ' strips to '' after trim → loop continues to the next line.
      expect(makeWithBody('#  \nreal').title()).toBe('real');
    });

    it('returns an empty string when body is empty', () => {
      expect(makeWithBody('').title()).toBe('');
    });

    it('returns an empty string when body is purely whitespace/newlines', () => {
      expect(makeWithBody('   \n\t\n  \n').title()).toBe('');
    });

    it('only strips ONE marker per line (a quoted heading still has its hash)', () => {
      // The implementation runs each replace once per line, so '> # heading'
      // strips the leading `>` and leaves `# heading` — title is `# heading`.
      expect(makeWithBody('> # heading').title()).toBe('# heading');
    });
  });

  describe('title is computed, not cached', () => {
    it('reflects the new content after changeContent', () => {
      const note = makeWithBody('# old');
      expect(note.title()).toBe('old');
      note.changeContent(unwrap(NoteContent.create('# new')), T1);
      expect(note.title()).toBe('new');
    });
  });
});

describe('Note.changeContent', () => {
  it('updates content and bumps updatedAt', () => {
    const note = makeWithBody('a');
    note.changeContent(unwrap(NoteContent.create('b')), T1);
    expect(note.content.value).toBe('b');
    expect(note.updatedAt).toBe(T1);
  });

  it('no-op guard: identical content does NOT bump updatedAt', () => {
    const note = makeWithBody('same');
    note.changeContent(unwrap(NoteContent.create('same')), T1);
    expect(note.updatedAt).toBe(T0); // T0, not T1
  });

  it('createdAt and id are immutable through changeContent', () => {
    const note = makeWithBody('a');
    const id = note.id;
    note.changeContent(unwrap(NoteContent.create('b')), T1);
    expect(note.id).toBe(id);
    expect(note.createdAt).toBe(T0);
  });
});

describe('Note.pin / unpin', () => {
  it('pin from unpinned: flips state and bumps updatedAt', () => {
    const note = makeWithBody('x');
    note.pin(T1);
    expect(note.pinned).toBe(true);
    expect(note.updatedAt).toBe(T1);
  });

  it('unpin from pinned: flips state and bumps updatedAt', () => {
    const note = makeWithBody('x');
    note.pin(T1);
    note.unpin(T2);
    expect(note.pinned).toBe(false);
    expect(note.updatedAt).toBe(T2);
  });

  it('pin while already pinned: NO updatedAt bump (ordering invariant)', () => {
    // Library list sorts by updatedAt; a "phantom bump" on a re-pin would
    // shuffle the note to the top for no user-visible reason.
    const note = makeWithBody('x');
    note.pin(T1);
    note.pin(T2);
    expect(note.pinned).toBe(true);
    expect(note.updatedAt).toBe(T1);
  });

  it('unpin while already unpinned: NO updatedAt bump', () => {
    const note = makeWithBody('x');
    note.unpin(T1);
    expect(note.pinned).toBe(false);
    expect(note.updatedAt).toBe(T0);
  });

  it('createdAt and id are immutable through pin/unpin', () => {
    const note = makeWithBody('x');
    const id = note.id;
    note.pin(T1);
    note.unpin(T2);
    expect(note.id).toBe(id);
    expect(note.createdAt).toBe(T0);
  });
});
