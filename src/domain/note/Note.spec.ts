import { NoteContent } from '@domain/draft/NoteContent';
import { describe, expect, it } from 'vitest';


import { Note } from './Note';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-01-01T00:01:00Z');

const make = (body: string) => {
  const c = NoteContent.create(body);
  if (!c.ok) throw c.error;
  return Note.create(c.value, T0);
};

describe('Note.title', () => {
  it('strips leading heading markers', () => {
    expect(make('# Hello\nworld').title()).toBe('Hello');
    expect(make('### Header').title()).toBe('Header');
  });

  it('strips bullets, ordered prefixes and blockquotes', () => {
    expect(make('- item').title()).toBe('item');
    expect(make('1. first').title()).toBe('first');
    expect(make('> quoted').title()).toBe('quoted');
  });

  it('uses the first non-empty line', () => {
    expect(make('\n\nfinally').title()).toBe('finally');
  });

  it('returns an empty string when the body is blank — presentation substitutes a localized fallback', () => {
    expect(make('').title()).toBe('');
    expect(make('   \n\t').title()).toBe('');
  });
});

describe('Note commands', () => {
  it('changes content and bumps updatedAt', () => {
    const note = make('a');
    const next = NoteContent.create('b');
    if (!next.ok) throw next.error;
    note.changeContent(next.value, T1);
    expect(note.content.value).toBe('b');
    expect(note.updatedAt).toEqual(T1);
  });

  it('pin/unpin are idempotent', () => {
    const note = make('x');
    note.pin(T1);
    note.pin(T1);
    expect(note.pinned).toBe(true);
    note.unpin(T1);
    note.unpin(T1);
    expect(note.pinned).toBe(false);
  });
});
