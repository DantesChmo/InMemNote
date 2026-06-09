import { IPC } from '@infrastructure/electron/ipc-channels';
import { ok } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { registerNotesIpc as RegisterNotesIpcFn } from '../../ipc/notes';

const handlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (e: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, cb);
    }),
  },
}));

let registerNotesIpc: typeof RegisterNotesIpcFn;

const VALID_ID = '22222222-2222-4222-8222-222222222222';

function makeNote(id: string = VALID_ID, content: string = '# Title\nbody'): {
  id: string;
  content: { value: string };
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  title: () => string;
} {
  return {
    id,
    content: { value: content },
    pinned: false,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    title: () => 'Title',
  };
}

beforeEach(async () => {
  handlers.clear();
  ({ registerNotesIpc } = await import('../../ipc/notes'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerNotesIpc', () => {
  function setup(): {
    uc: {
      listNotes: { execute: ReturnType<typeof vi.fn> };
      findNote: { execute: ReturnType<typeof vi.fn> };
      createNote: { execute: ReturnType<typeof vi.fn> };
      updateNote: { execute: ReturnType<typeof vi.fn> };
      togglePinNote: { execute: ReturnType<typeof vi.fn> };
      deleteNote: { execute: ReturnType<typeof vi.fn> };
      searchNotes: { execute: ReturnType<typeof vi.fn> };
    };
    emitNotesChanged: ReturnType<typeof vi.fn>;
  } {
    const uc = {
      listNotes: { execute: vi.fn(async () => [makeNote()]) },
      findNote: { execute: vi.fn(async () => makeNote()) },
      createNote: { execute: vi.fn(async () => makeNote()) },
      updateNote: { execute: vi.fn(async () => ok(makeNote(VALID_ID, 'updated'))) },
      togglePinNote: { execute: vi.fn(async () => ok(makeNote())) },
      deleteNote: { execute: vi.fn(async () => undefined) },
      searchNotes: { execute: vi.fn(async () => [makeNote()]) },
    };
    const emitNotesChanged = vi.fn();
    registerNotesIpc({ uc: uc as never, emitNotesChanged });
    return { uc, emitNotesChanged };
  }

  it('registers every Notes channel', () => {
    setup();
    expect(handlers.has(IPC.NotesList)).toBe(true);
    expect(handlers.has(IPC.NotesGet)).toBe(true);
    expect(handlers.has(IPC.NotesCreate)).toBe(true);
    expect(handlers.has(IPC.NotesSave)).toBe(true);
    expect(handlers.has(IPC.NotesTogglePin)).toBe(true);
    expect(handlers.has(IPC.NotesDelete)).toBe(true);
    expect(handlers.has(IPC.NotesSearch)).toBe(true);
  });

  it('NotesList maps domain to DTOs via the filter', async () => {
    const { uc } = setup();
    const result = (await handlers.get(IPC.NotesList)!({}, 'pinned')) as Array<{
      id: string;
      title: string;
    }>;
    expect(uc.listNotes.execute).toHaveBeenCalledWith('pinned');
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Title');
  });

  it('NotesGet returns null for an unknown id', async () => {
    const { uc } = setup();
    uc.findNote.execute.mockResolvedValueOnce(null);
    const result = await handlers.get(IPC.NotesGet)!({}, VALID_ID);
    expect(result).toBeNull();
  });

  it('NotesGet rejects an invalid id', async () => {
    setup();
    await expect(handlers.get(IPC.NotesGet)!({}, 'nope')).rejects.toThrow();
  });

  it('NotesCreate broadcasts and returns the new note', async () => {
    const { emitNotesChanged } = setup();
    const result = (await handlers.get(IPC.NotesCreate)!({})) as { id: string };
    expect(emitNotesChanged).toHaveBeenCalled();
    expect(result.id).toBe(VALID_ID);
  });

  it('NotesSave parses id, dispatches use-case, broadcasts', async () => {
    const { uc, emitNotesChanged } = setup();
    const result = (await handlers.get(IPC.NotesSave)!({}, VALID_ID, 'updated')) as {
      content: string;
    };
    expect(uc.updateNote.execute).toHaveBeenCalled();
    expect(emitNotesChanged).toHaveBeenCalled();
    expect(result.content).toBe('updated');
  });

  it('NotesTogglePin broadcasts', async () => {
    const { emitNotesChanged } = setup();
    await handlers.get(IPC.NotesTogglePin)!({}, VALID_ID);
    expect(emitNotesChanged).toHaveBeenCalled();
  });

  it('NotesDelete dispatches and broadcasts', async () => {
    const { uc, emitNotesChanged } = setup();
    await handlers.get(IPC.NotesDelete)!({}, VALID_ID);
    expect(uc.deleteNote.execute).toHaveBeenCalled();
    expect(emitNotesChanged).toHaveBeenCalled();
  });

  it('NotesSearch returns DTO list', async () => {
    const { uc } = setup();
    const result = (await handlers.get(IPC.NotesSearch)!({}, 'query')) as Array<{ id: string }>;
    expect(uc.searchNotes.execute).toHaveBeenCalledWith('query');
    expect(result).toHaveLength(1);
  });
});
