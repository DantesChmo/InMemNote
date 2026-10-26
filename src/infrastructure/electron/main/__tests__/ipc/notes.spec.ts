import { NoteNotFoundError } from '@application/note/errors';
import { NoteId } from '@domain/note/NoteId';
import { IPC } from '@shared/ipc';
import { err, ok } from '@shared/Result';
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

function makeNote(
  id: string = VALID_ID,
  content: string = '# Title\nbody',
): {
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

  // The renderer is untrusted input: every payload is Zod-validated before it
  // reaches a use-case, so a malformed call fails with a readable error at the
  // boundary instead of somewhere deep inside the domain or SQLite.
  describe('payload validation', () => {
    const invalid = /Invalid IPC payload for "notes:/;

    it.each([['archived'], [42], [undefined], [{ filter: 'all' }]])(
      'NotesList rejects filter %j without calling the use-case',
      async (filter) => {
        const { uc } = setup();
        await expect(handlers.get(IPC.NotesList)!({}, filter)).rejects.toThrow(invalid);
        expect(uc.listNotes.execute).not.toHaveBeenCalled();
      },
    );

    it('NotesList accepts "all"', async () => {
      const { uc } = setup();
      await handlers.get(IPC.NotesList)!({}, 'all');
      expect(uc.listNotes.execute).toHaveBeenCalledWith('all');
    });

    it.each([[123], [null], [undefined], [{ id: VALID_ID }]])(
      'NotesGet rejects non-string id %j',
      async (id) => {
        const { uc } = setup();
        await expect(handlers.get(IPC.NotesGet)!({}, id)).rejects.toThrow(invalid);
        expect(uc.findNote.execute).not.toHaveBeenCalled();
      },
    );

    it.each([[{ text: 'x' }], [42], [null], [undefined], [['a']]])(
      'NotesSave rejects non-string content %j without persisting or broadcasting',
      async (content) => {
        const { uc, emitNotesChanged } = setup();
        await expect(handlers.get(IPC.NotesSave)!({}, VALID_ID, content)).rejects.toThrow(invalid);
        expect(uc.updateNote.execute).not.toHaveBeenCalled();
        expect(emitNotesChanged).not.toHaveBeenCalled();
      },
    );

    it('NotesSave accepts an empty string as content', async () => {
      const { uc } = setup();
      await handlers.get(IPC.NotesSave)!({}, VALID_ID, '');
      expect(uc.updateNote.execute).toHaveBeenCalled();
    });

    it('NotesSave rejects a non-string id', async () => {
      const { uc } = setup();
      await expect(handlers.get(IPC.NotesSave)!({}, 7, 'x')).rejects.toThrow(invalid);
      expect(uc.updateNote.execute).not.toHaveBeenCalled();
    });

    it('NotesSave rejects unexpected extra arguments', async () => {
      const { uc } = setup();
      await expect(handlers.get(IPC.NotesSave)!({}, VALID_ID, 'x', 'extra')).rejects.toThrow(
        invalid,
      );
      expect(uc.updateNote.execute).not.toHaveBeenCalled();
    });

    it('NotesTogglePin rejects a non-string id', async () => {
      const { uc, emitNotesChanged } = setup();
      await expect(handlers.get(IPC.NotesTogglePin)!({}, 1)).rejects.toThrow(invalid);
      expect(uc.togglePinNote.execute).not.toHaveBeenCalled();
      expect(emitNotesChanged).not.toHaveBeenCalled();
    });

    it('NotesDelete rejects a non-string id', async () => {
      const { uc, emitNotesChanged } = setup();
      await expect(handlers.get(IPC.NotesDelete)!({}, undefined)).rejects.toThrow(invalid);
      expect(uc.deleteNote.execute).not.toHaveBeenCalled();
      expect(emitNotesChanged).not.toHaveBeenCalled();
    });

    it.each([[null], [undefined], [5], [{ q: 'x' }]])(
      'NotesSearch rejects non-string query %j',
      async (query) => {
        const { uc } = setup();
        await expect(handlers.get(IPC.NotesSearch)!({}, query)).rejects.toThrow(invalid);
        expect(uc.searchNotes.execute).not.toHaveBeenCalled();
      },
    );

    it('names the offending argument in the error message', async () => {
      setup();
      await expect(handlers.get(IPC.NotesSave)!({}, VALID_ID, 42)).rejects.toThrow(
        /notes:save.*\[1\]/,
      );
    });
  });

  // A well-typed string that is not a UUID passes the Zod tuple (ids are a
  // domain rule, not a wire-format rule) and must be stopped by `NoteId.create`
  // before any use-case or broadcast.
  describe('malformed ids', () => {
    it.each([
      [IPC.NotesGet, 'findNote', []],
      [IPC.NotesSave, 'updateNote', ['body']],
      [IPC.NotesTogglePin, 'togglePinNote', []],
      [IPC.NotesDelete, 'deleteNote', []],
    ] as const)(
      '%s rejects a non-UUID id without touching the use-case',
      async (channel, name, rest) => {
        const { uc, emitNotesChanged } = setup();
        await expect(handlers.get(channel)!({}, 'not-a-uuid', ...rest)).rejects.toThrow(
          /Invalid NoteId/,
        );
        expect(uc[name].execute).not.toHaveBeenCalled();
        expect(emitNotesChanged).not.toHaveBeenCalled();
      },
    );
  });

  // An error Result must reach the renderer as a rejected invoke() carrying the
  // domain message, and must NOT announce a change that never happened.
  describe('error results', () => {
    const missing = NoteId.generate();

    it('NotesSave rejects with the domain message and does not broadcast', async () => {
      const { uc, emitNotesChanged } = setup();
      uc.updateNote.execute.mockResolvedValueOnce(err(new NoteNotFoundError(missing)));
      await expect(handlers.get(IPC.NotesSave)!({}, VALID_ID, 'x')).rejects.toThrow(
        `Note not found: ${missing}`,
      );
      expect(emitNotesChanged).not.toHaveBeenCalled();
    });

    it('NotesTogglePin rejects with the domain message and does not broadcast', async () => {
      const { uc, emitNotesChanged } = setup();
      uc.togglePinNote.execute.mockResolvedValueOnce(err(new NoteNotFoundError(missing)));
      await expect(handlers.get(IPC.NotesTogglePin)!({}, VALID_ID)).rejects.toThrow(
        `Note not found: ${missing}`,
      );
      expect(emitNotesChanged).not.toHaveBeenCalled();
    });
  });

  it('NotesGet returns the DTO of a note that exists', async () => {
    setup();
    const result = (await handlers.get(IPC.NotesGet)!({}, VALID_ID)) as {
      id: string;
      title: string;
    };
    expect(result).toMatchObject({ id: VALID_ID, title: 'Title' });
  });
});
