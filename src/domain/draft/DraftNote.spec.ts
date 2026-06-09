// Exhaustive spec for the DraftNote aggregate.
//
// What we pin (each of these is a real invariant the rest of the app relies on):
//   - create() emits exactly one DraftCreated event with the matching id/at;
//   - restore() emits NO events (it's rehydration, not domain motion);
//   - changeContent / pin / unpin only emit when state actually changes;
//   - updatedAt only moves when state actually changes — ordering downstream
//     (findLatest, list ordering) trusts this;
//   - createdAt and id are immutable through every command;
//   - pullEvents drains the buffer and returns a *copy* (mutating the result
//     does not corrupt internal state);
//   - the Date passed in is the exact value stored — no clock cheating.
import { describe, expect, it } from 'vitest';

import { unwrap } from '@shared/Result';

import { DraftId } from './DraftId';
import { DraftNote } from './DraftNote';
import { NoteContent } from './NoteContent';

const T0 = new Date('2026-01-01T00:00:00.000Z');
const T1 = new Date('2026-01-01T00:01:00.000Z');
const T2 = new Date('2026-01-01T00:02:00.000Z');

function content(value: string): NoteContent {
  return unwrap(NoteContent.create(value));
}

describe('DraftNote.create', () => {
  it('emits exactly one DraftCreated event carrying the aggregate id and the supplied now', () => {
    const note = DraftNote.create(T0);
    const events = note.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('DraftCreated');
    expect(events[0]?.id).toBe(note.id);
    expect(events[0]?.at).toBe(T0);
  });

  it('starts empty, unpinned, and stamps both timestamps to the supplied now', () => {
    const note = DraftNote.create(T0);
    expect(note.content.isEmpty()).toBe(true);
    expect(note.content.value).toBe('');
    expect(note.pinned).toBe(false);
    expect(note.createdAt).toBe(T0);
    expect(note.updatedAt).toBe(T0);
  });

  it('assigns a DraftId that passes its own validator', () => {
    const note = DraftNote.create(T0);
    expect(DraftId.create(note.id).ok).toBe(true);
  });

  it('two creations produce distinct ids', () => {
    const a = DraftNote.create(T0);
    const b = DraftNote.create(T0);
    expect(a.id).not.toBe(b.id);
  });
});

describe('DraftNote.restore', () => {
  it('preserves every field exactly as supplied', () => {
    const id = unwrap(DraftId.create('550e8400-e29b-41d4-a716-446655440000'));
    const c = content('body');
    const note = DraftNote.restore({
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

  it('emits no domain events (rehydration is not a domain transition)', () => {
    const note = DraftNote.restore({
      id: unwrap(DraftId.create('550e8400-e29b-41d4-a716-446655440000')),
      content: content('body'),
      pinned: false,
      createdAt: T0,
      updatedAt: T0,
    });
    expect(note.pullEvents()).toHaveLength(0);
  });
});

describe('DraftNote.changeContent', () => {
  it('updates content + updatedAt and emits DraftContentChanged', () => {
    const note = DraftNote.create(T0);
    note.pullEvents(); // drop creation event

    note.changeContent(content('hello'), T1);

    expect(note.content.value).toBe('hello');
    expect(note.updatedAt).toBe(T1);
    const events = note.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('DraftContentChanged');
    expect(events[0]?.id).toBe(note.id);
    expect(events[0]?.at).toBe(T1);
  });

  it('no-op guard: identical content does NOT emit and does NOT bump updatedAt', () => {
    const note = DraftNote.create(T0);
    note.pullEvents();

    // Re-applying the same empty content.
    note.changeContent(NoteContent.empty(), T1);

    expect(note.updatedAt).toBe(T0);
    expect(note.pullEvents()).toHaveLength(0);
  });

  it('no-op guard distinguishes byte-equal content (the equals contract, not isEmpty)', () => {
    // Whitespace-only is isEmpty but NOT equal to "" — a flip between them is
    // a real change and must bump updatedAt.
    const note = DraftNote.create(T0);
    note.pullEvents();

    note.changeContent(content('   '), T1);

    expect(note.content.value).toBe('   ');
    expect(note.updatedAt).toBe(T1);
    expect(note.pullEvents().map((e) => e.type)).toEqual(['DraftContentChanged']);
  });

  it('createdAt and id are immutable through changeContent', () => {
    const note = DraftNote.create(T0);
    const id = note.id;
    note.changeContent(content('x'), T1);
    expect(note.id).toBe(id);
    expect(note.createdAt).toBe(T0);
  });

  it('successive changes accumulate events, each carrying its own timestamp', () => {
    const note = DraftNote.create(T0);
    note.pullEvents();

    note.changeContent(content('a'), T1);
    note.changeContent(content('ab'), T2);

    const events = note.pullEvents();
    expect(events.map((e) => e.type)).toEqual(['DraftContentChanged', 'DraftContentChanged']);
    expect(events.map((e) => e.at)).toEqual([T1, T2]);
  });
});

describe('DraftNote.pin / unpin', () => {
  it('pin from unpinned: flips state, bumps updatedAt, emits DraftPinned', () => {
    const note = DraftNote.create(T0);
    note.pullEvents();

    note.pin(T1);

    expect(note.pinned).toBe(true);
    expect(note.updatedAt).toBe(T1);
    const events = note.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('DraftPinned');
    expect(events[0]?.at).toBe(T1);
    expect(events[0]?.id).toBe(note.id);
  });

  it('unpin from pinned: flips state, bumps updatedAt, emits DraftUnpinned', () => {
    const note = DraftNote.create(T0);
    note.pin(T1);
    note.pullEvents();

    note.unpin(T2);

    expect(note.pinned).toBe(false);
    expect(note.updatedAt).toBe(T2);
    const events = note.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('DraftUnpinned');
    expect(events[0]?.at).toBe(T2);
  });

  it('pin while already pinned is a no-op: no event, no updatedAt bump', () => {
    const note = DraftNote.create(T0);
    note.pin(T1);
    note.pullEvents();

    note.pin(T2);

    expect(note.pinned).toBe(true);
    expect(note.updatedAt).toBe(T1); // T1, not T2
    expect(note.pullEvents()).toHaveLength(0);
  });

  it('unpin while already unpinned is a no-op: no event, no updatedAt bump', () => {
    const note = DraftNote.create(T0);
    note.pullEvents();

    note.unpin(T1);

    expect(note.pinned).toBe(false);
    expect(note.updatedAt).toBe(T0);
    expect(note.pullEvents()).toHaveLength(0);
  });

  it('createdAt and id are immutable through pin/unpin', () => {
    const note = DraftNote.create(T0);
    const id = note.id;
    note.pin(T1);
    note.unpin(T2);
    expect(note.id).toBe(id);
    expect(note.createdAt).toBe(T0);
  });
});

describe('DraftNote.pullEvents', () => {
  it('drains the buffer: a second call after the first returns an empty list', () => {
    const note = DraftNote.create(T0);
    expect(note.pullEvents()).toHaveLength(1);
    expect(note.pullEvents()).toHaveLength(0);
  });

  it('returns a defensive copy — mutating the result does not affect the aggregate', () => {
    const note = DraftNote.create(T0);
    note.pin(T1);

    const first = note.pullEvents() as unknown as Array<{ type: string }>;
    expect(first).toHaveLength(2);

    // Mutate the returned array. This must not pollute any subsequent reads.
    first.length = 0;
    first.push({ type: 'POISON' });

    // The internal buffer was already drained by the pull above, so a fresh
    // pull is empty regardless.
    expect(note.pullEvents()).toHaveLength(0);

    // A subsequent legitimate change still produces ONLY the right event.
    note.unpin(T2);
    const next = note.pullEvents();
    expect(next).toHaveLength(1);
    expect(next[0]?.type).toBe('DraftUnpinned');
  });

  it('preserves event order across mixed command sequences', () => {
    const note = DraftNote.create(T0);

    note.changeContent(content('a'), T1);
    note.pin(T1);
    note.changeContent(content('ab'), T2);
    note.unpin(T2);

    const types = note.pullEvents().map((e) => e.type);
    expect(types).toEqual([
      'DraftCreated',
      'DraftContentChanged',
      'DraftPinned',
      'DraftContentChanged',
      'DraftUnpinned',
    ]);
  });
});
