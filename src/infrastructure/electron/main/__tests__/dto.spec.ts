import { DraftId } from '@domain/draft/DraftId';
import { DraftNote } from '@domain/draft/DraftNote';
import { NoteContent } from '@domain/draft/NoteContent';
import { Note } from '@domain/note/Note';
import { NoteId } from '@domain/note/NoteId';
import { AppSettings } from '@domain/settings/AppSettings';
import { unwrap } from '@shared/Result';
import { describe, expect, it } from 'vitest';

import { draftToDTO, noteToDTO, settingsToDTO } from '../dto';

const VALID_ID = '11111111-1111-4111-8111-111111111111';

describe('draftToDTO', () => {
  it('serializes every field including ISO timestamps', () => {
    const id = unwrap(DraftId.create(VALID_ID));
    const content = unwrap(NoteContent.create('hello'));
    const created = new Date('2025-01-01T00:00:00.000Z');
    const updated = new Date('2025-01-02T03:04:05.000Z');
    const draft = DraftNote.restore({ id, content, pinned: true, createdAt: created, updatedAt: updated });

    const dto = draftToDTO(draft);

    expect(dto).toEqual({
      id: VALID_ID,
      content: 'hello',
      pinned: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T03:04:05.000Z',
    });
  });

  it('serializes a pristine draft as unpinned with empty content', () => {
    const draft = DraftNote.create(new Date('2025-06-09T12:00:00.000Z'));
    const dto = draftToDTO(draft);
    expect(dto.pinned).toBe(false);
    expect(dto.content).toBe('');
    expect(dto.createdAt).toBe('2025-06-09T12:00:00.000Z');
    expect(dto.updatedAt).toBe('2025-06-09T12:00:00.000Z');
  });
});

describe('noteToDTO', () => {
  it('derives title from the first non-empty line', () => {
    const id = unwrap(NoteId.create(VALID_ID));
    const content = unwrap(NoteContent.create('# Hello world\nbody'));
    const created = new Date('2025-01-01T00:00:00.000Z');
    const note = Note.restore({ id, content, pinned: false, createdAt: created, updatedAt: created });

    const dto = noteToDTO(note);

    expect(dto.title).toBe('Hello world');
    expect(dto.content).toBe('# Hello world\nbody');
    expect(dto.id).toBe(VALID_ID);
    expect(dto.pinned).toBe(false);
  });

  it('returns empty title for a blank note', () => {
    const id = unwrap(NoteId.create(VALID_ID));
    const content = unwrap(NoteContent.create(''));
    const now = new Date('2025-01-01T00:00:00.000Z');
    const note = Note.restore({ id, content, pinned: true, createdAt: now, updatedAt: now });

    expect(noteToDTO(note).title).toBe('');
  });
});

describe('settingsToDTO', () => {
  it('produces a plain transport object', () => {
    const s = AppSettings.default();
    const dto = settingsToDTO(s);
    expect(dto.openDraftHotkey).toBe('CommandOrControl+Shift+Space');
    expect(dto.themeMode).toBeDefined();
    expect(dto.language).toBeDefined();
    expect(typeof dto.palette).toBe('object');
  });
});
