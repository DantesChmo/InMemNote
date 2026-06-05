import { describe, expect, it } from 'vitest';

import { DraftNote } from './DraftNote';
import { NoteContent } from './NoteContent';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-01-01T00:01:00Z');
const T2 = new Date('2026-01-01T00:02:00Z');

describe('DraftNote', () => {
  it('emits DraftCreated on creation', () => {
    const note = DraftNote.create(T0);
    const events = note.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('DraftCreated');
  });

  it('starts empty and unpinned', () => {
    const note = DraftNote.create(T0);
    expect(note.content.isEmpty()).toBe(true);
    expect(note.pinned).toBe(false);
  });

  it('updates content and timestamp, emitting DraftContentChanged', () => {
    const note = DraftNote.create(T0);
    note.pullEvents(); // drop creation event

    const next = NoteContent.create('hello');
    if (!next.ok) throw next.error;
    note.changeContent(next.value, T1);

    expect(note.updatedAt).toEqual(T1);
    expect(note.content.value).toBe('hello');
    const events = note.pullEvents();
    expect(events.map((e) => e.type)).toEqual(['DraftContentChanged']);
  });

  it('does not emit when content is unchanged', () => {
    const note = DraftNote.create(T0);
    note.pullEvents();
    note.changeContent(NoteContent.empty(), T1);
    expect(note.pullEvents()).toHaveLength(0);
    expect(note.updatedAt).toEqual(T0);
  });

  it('toggles pin and emits matching events', () => {
    const note = DraftNote.create(T0);
    note.pullEvents();

    note.pin(T1);
    expect(note.pinned).toBe(true);
    expect(note.pullEvents().map((e) => e.type)).toEqual(['DraftPinned']);

    note.unpin(T2);
    expect(note.pinned).toBe(false);
    expect(note.pullEvents().map((e) => e.type)).toEqual(['DraftUnpinned']);
  });

  it('pin/unpin are idempotent', () => {
    const note = DraftNote.create(T0);
    note.pullEvents();
    note.unpin(T1); // already unpinned
    expect(note.pullEvents()).toHaveLength(0);
    note.pin(T1);
    note.pullEvents();
    note.pin(T2); // already pinned
    expect(note.pullEvents()).toHaveLength(0);
  });
});
