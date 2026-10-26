// Unit tests for the library slice.
//
// As with settings/slice.spec.ts: reducers are exercised as pure functions, and
// async thunks are exercised through a real `configureStore` with the slice's
// reducer mounted, so we can observe the extraReducers' effect on state.
//
// `window.inmemnote` is replaced per-test via `installInmemnoteApiMock()` — no
// real IPC, no React, no app-level store composition.
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installInmemnoteApiMock, noteDTO } from '../../test/mockInmemnoteApi';

import {
  commitDelete,
  createNote,
  deleteNote,
  fetchCatalog,
  fetchNotes,
  libraryActions,
  libraryReducer,
  saveNote,
  toggleNotePin,
  undoDelete,
  type LibraryState,
} from './slice';

import type { InmemnoteAPI, NoteDTO } from '@shared/ipc';

function makeStore(preloaded?: LibraryState) {
  return configureStore({
    reducer: { library: libraryReducer },
    preloadedState: preloaded ? { library: preloaded } : undefined,
  });
}

type Store = ReturnType<typeof makeStore>;

const initialState: LibraryState = {
  notes: [],
  catalog: [],
  filter: 'all',
  query: '',
  selectedId: null,
  loading: false,
  error: null,
  pendingDelete: null,
};

function stateWith(overrides: Partial<LibraryState>): LibraryState {
  return { ...initialState, ...overrides };
}

describe('libraryReducer — pure reducers', () => {
  it('returns the initial state for an unknown action', () => {
    expect(libraryReducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  describe('setFilter', () => {
    it('switches the filter and clears the active search query', () => {
      const previous = stateWith({ filter: 'all', query: 'hello' });
      const next = libraryReducer(previous, libraryActions.setFilter('pinned'));
      expect(next.filter).toBe('pinned');
      expect(next.query).toBe('');
    });
  });

  describe('setQuery', () => {
    it('updates the query field only', () => {
      const previous = stateWith({ filter: 'pinned', query: 'old' });
      const next = libraryReducer(previous, libraryActions.setQuery('new'));
      expect(next.query).toBe('new');
      expect(next.filter).toBe('pinned');
    });
  });

  describe('setSelected', () => {
    it('sets the selected note id', () => {
      const next = libraryReducer(initialState, libraryActions.setSelected('note-9'));
      expect(next.selectedId).toBe('note-9');
    });

    it('accepts null to clear the selection', () => {
      const previous = stateWith({ selectedId: 'note-9' });
      const next = libraryReducer(previous, libraryActions.setSelected(null));
      expect(next.selectedId).toBeNull();
    });
  });

  describe('patchSelectedContent', () => {
    it('mutates only the selected note content', () => {
      const a = noteDTO({ id: 'a', content: 'A old' });
      const b = noteDTO({ id: 'b', content: 'B old' });
      const previous = stateWith({ notes: [a, b], selectedId: 'b' });

      const next = libraryReducer(previous, libraryActions.patchSelectedContent('B new'));

      expect(next.notes.find((n) => n.id === 'a')?.content).toBe('A old');
      expect(next.notes.find((n) => n.id === 'b')?.content).toBe('B new');
    });

    it('is a no-op when nothing is selected', () => {
      const previous = stateWith({
        notes: [noteDTO({ id: 'a', content: 'A' })],
        selectedId: null,
      });
      const next = libraryReducer(previous, libraryActions.patchSelectedContent('X'));
      expect(next.notes[0]?.content).toBe('A');
    });

    it('is a no-op when the selected id is not in the notes array', () => {
      const previous = stateWith({
        notes: [noteDTO({ id: 'a', content: 'A' })],
        selectedId: 'ghost',
      });
      const next = libraryReducer(previous, libraryActions.patchSelectedContent('X'));
      expect(next.notes[0]?.content).toBe('A');
    });
  });
});

describe('library async thunks', () => {
  let api: InmemnoteAPI;
  let store: Store;

  beforeEach(() => {
    api = installInmemnoteApiMock();
    store = makeStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchNotes', () => {
    it('routes to notes.list with the current filter when query is empty', async () => {
      const dto = [noteDTO({ id: 'n1' }), noteDTO({ id: 'n2' })];
      (api.notes.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dto);
      store = makeStore(stateWith({ filter: 'pinned' }));

      await store.dispatch(fetchNotes());

      expect(api.notes.list).toHaveBeenCalledWith('pinned');
      expect(api.notes.search).not.toHaveBeenCalled();
      expect(store.getState().library.notes).toEqual(dto);
      expect(store.getState().library.loading).toBe(false);
    });

    it('routes to notes.search when the query is non-empty (trimmed)', async () => {
      const dto = [noteDTO({ id: 'hit' })];
      (api.notes.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dto);
      store = makeStore(stateWith({ query: '  hello  ' }));

      await store.dispatch(fetchNotes());

      expect(api.notes.search).toHaveBeenCalledWith('hello');
      expect(api.notes.list).not.toHaveBeenCalled();
      expect(store.getState().library.notes).toEqual(dto);
    });

    it('treats a whitespace-only query as empty and lists by filter instead', async () => {
      (api.notes.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      store = makeStore(stateWith({ query: '   ', filter: 'all' }));

      await store.dispatch(fetchNotes());

      expect(api.notes.list).toHaveBeenCalledWith('all');
      expect(api.notes.search).not.toHaveBeenCalled();
    });

    it('preserves selectedId when the selected note is still present', async () => {
      const dto = [noteDTO({ id: 'a' }), noteDTO({ id: 'b' })];
      (api.notes.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dto);
      store = makeStore(stateWith({ selectedId: 'b' }));

      await store.dispatch(fetchNotes());

      expect(store.getState().library.selectedId).toBe('b');
    });

    it('falls back to the first note when the previous selection is gone', async () => {
      const dto = [noteDTO({ id: 'a' }), noteDTO({ id: 'b' })];
      (api.notes.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dto);
      store = makeStore(stateWith({ selectedId: 'ghost' }));

      await store.dispatch(fetchNotes());

      expect(store.getState().library.selectedId).toBe('a');
    });

    it('clears the selection when the result is empty', async () => {
      (api.notes.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      store = makeStore(stateWith({ selectedId: 'ghost' }));

      await store.dispatch(fetchNotes());

      expect(store.getState().library.selectedId).toBeNull();
    });

    it('captures error on rejected and resets loading', async () => {
      (api.notes.list as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('io'));

      await store.dispatch(fetchNotes());

      expect(store.getState().library.loading).toBe(false);
      expect(store.getState().library.error).toBe('io');
    });

    it('falls back to a default error message when rejection has none', async () => {
      (api.notes.list as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        throw {};
      });

      await store.dispatch(fetchNotes());

      expect(store.getState().library.error).toBe('Failed to load notes');
    });

    it('flips loading to true on pending and clears stale error', async () => {
      // Seed a previous error.
      (api.notes.list as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('first'));
      await store.dispatch(fetchNotes());
      expect(store.getState().library.error).toBe('first');

      let loadingDuringPending: boolean | null = null;
      let errorDuringPending: string | null | undefined = undefined;
      (api.notes.list as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        loadingDuringPending = store.getState().library.loading;
        errorDuringPending = store.getState().library.error;
        return [];
      });

      await store.dispatch(fetchNotes());

      expect(loadingDuringPending).toBe(true);
      expect(errorDuringPending).toBeNull();
    });
  });

  describe('createNote', () => {
    it('prepends the new note, selects it, and resets filter/query to "all"', async () => {
      const existing: NoteDTO = noteDTO({ id: 'old' });
      const created: NoteDTO = noteDTO({ id: 'new' });
      (api.notes.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(created);
      store = makeStore(
        stateWith({
          notes: [existing],
          filter: 'pinned',
          query: 'something',
          selectedId: 'old',
        }),
      );

      await store.dispatch(createNote());

      const s = store.getState().library;
      expect(s.notes[0]).toEqual(created);
      expect(s.notes).toHaveLength(2);
      expect(s.selectedId).toBe('new');
      expect(s.filter).toBe('all');
      expect(s.query).toBe('');
    });
  });

  describe('saveNote', () => {
    it('forwards id/content to notes.save and replaces the note in place', async () => {
      const before = noteDTO({ id: 'n1', content: 'old' });
      const after: NoteDTO = noteDTO({
        id: 'n1',
        content: 'new',
        updatedAt: '2026-06-09T12:00:00.000Z',
      });
      (api.notes.save as ReturnType<typeof vi.fn>).mockResolvedValueOnce(after);
      store = makeStore(stateWith({ notes: [before], selectedId: 'n1' }));

      await store.dispatch(saveNote({ id: 'n1', content: 'new' }));

      expect(api.notes.save).toHaveBeenCalledWith('n1', 'new');
      expect(store.getState().library.notes[0]).toEqual(after);
    });

    it('is a no-op on the notes array when the id is unknown', async () => {
      const existing = noteDTO({ id: 'n1' });
      const phantom: NoteDTO = noteDTO({ id: 'ghost' });
      (api.notes.save as ReturnType<typeof vi.fn>).mockResolvedValueOnce(phantom);
      store = makeStore(stateWith({ notes: [existing] }));

      await store.dispatch(saveNote({ id: 'ghost', content: 'x' }));

      expect(store.getState().library.notes).toEqual([existing]);
    });
  });

  describe('toggleNotePin', () => {
    it('forwards the id to togglePin and replaces the note with the response', async () => {
      const before = noteDTO({ id: 'n1', pinned: false });
      const after: NoteDTO = noteDTO({ id: 'n1', pinned: true });
      (api.notes.togglePin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(after);
      store = makeStore(stateWith({ notes: [before] }));

      await store.dispatch(toggleNotePin('n1'));

      expect(api.notes.togglePin).toHaveBeenCalledWith('n1');
      expect(store.getState().library.notes[0]?.pinned).toBe(true);
    });
  });

  describe('deleteNote (soft delete)', () => {
    it('hides the note and keeps it as the pending delete without calling IPC', async () => {
      const a = noteDTO({ id: 'a' });
      const b = noteDTO({ id: 'b' });
      store = makeStore(stateWith({ notes: [a, b], selectedId: 'a' }));

      await store.dispatch(deleteNote('b'));

      expect(api.notes.delete).not.toHaveBeenCalled();
      expect(store.getState().library.notes.map((n) => n.id)).toEqual(['a']);
      expect(store.getState().library.pendingDelete).toEqual({ note: b, index: 1 });
    });

    it('reassigns selection to the next remaining note when the selected one is deleted', async () => {
      const a = noteDTO({ id: 'a' });
      const b = noteDTO({ id: 'b' });
      store = makeStore(stateWith({ notes: [a, b], selectedId: 'a' }));

      await store.dispatch(deleteNote('a'));

      expect(store.getState().library.selectedId).toBe('b');
    });

    it('clears the selection when the last note is deleted', async () => {
      const a = noteDTO({ id: 'a' });
      store = makeStore(stateWith({ notes: [a], selectedId: 'a' }));

      await store.dispatch(deleteNote('a'));

      expect(store.getState().library.selectedId).toBeNull();
      expect(store.getState().library.notes).toEqual([]);
    });

    it('leaves the selection alone when a non-selected note is deleted', async () => {
      const a = noteDTO({ id: 'a' });
      const b = noteDTO({ id: 'b' });
      store = makeStore(stateWith({ notes: [a, b], selectedId: 'a' }));

      await store.dispatch(deleteNote('b'));

      expect(store.getState().library.selectedId).toBe('a');
    });

    it('commits a still-pending previous delete before staging the next one', async () => {
      const a = noteDTO({ id: 'a' });
      const b = noteDTO({ id: 'b' });
      const c = noteDTO({ id: 'c' });
      store = makeStore(stateWith({ notes: [a, b, c], selectedId: 'a' }));

      await store.dispatch(deleteNote('a'));
      await store.dispatch(deleteNote('b'));

      expect(api.notes.delete).toHaveBeenCalledTimes(1);
      expect(api.notes.delete).toHaveBeenCalledWith('a');
      expect(store.getState().library.notes.map((n) => n.id)).toEqual(['c']);
      expect(store.getState().library.pendingDelete?.note.id).toBe('b');
    });

    it('ignores an id that is not in the list', async () => {
      const a = noteDTO({ id: 'a' });
      store = makeStore(stateWith({ notes: [a], selectedId: 'a' }));

      await store.dispatch(deleteNote('ghost'));

      expect(store.getState().library.notes).toEqual([a]);
      expect(store.getState().library.pendingDelete).toBeNull();
    });
  });

  describe('commitDelete', () => {
    it('deletes the pending note over IPC and clears the pending slot', async () => {
      const a = noteDTO({ id: 'a' });
      store = makeStore(stateWith({ pendingDelete: { note: a, index: 0 } }));

      await store.dispatch(commitDelete('a'));

      expect(api.notes.delete).toHaveBeenCalledWith('a');
      expect(store.getState().library.pendingDelete).toBeNull();
    });

    it('is a no-op for an id that is not pending (undone or already committed)', async () => {
      const a = noteDTO({ id: 'a' });
      store = makeStore(stateWith({ pendingDelete: { note: a, index: 0 } }));

      await store.dispatch(commitDelete('other'));
      expect(api.notes.delete).not.toHaveBeenCalled();
      expect(store.getState().library.pendingDelete?.note.id).toBe('a');

      store = makeStore(stateWith({ pendingDelete: null }));
      await store.dispatch(commitDelete('a'));
      expect(api.notes.delete).not.toHaveBeenCalled();
    });

    it('commits only once when two triggers race (timer + unload)', async () => {
      const a = noteDTO({ id: 'a' });
      store = makeStore(stateWith({ pendingDelete: { note: a, index: 0 } }));

      await Promise.all([store.dispatch(commitDelete('a')), store.dispatch(commitDelete('a'))]);

      expect(api.notes.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('undoDelete', () => {
    it('puts the note back, selects it and resyncs the list without deleting it', async () => {
      const a = noteDTO({ id: 'a' });
      const b = noteDTO({ id: 'b' });
      const c = noteDTO({ id: 'c' });
      (api.notes.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([a, b, c]);
      store = makeStore(stateWith({ notes: [a, b, c], selectedId: 'a' }));
      await store.dispatch(deleteNote('b'));

      await store.dispatch(undoDelete());

      expect(api.notes.list).toHaveBeenCalledWith('all');
      expect(api.notes.delete).not.toHaveBeenCalled();
      expect(store.getState().library.notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
      expect(store.getState().library.selectedId).toBe('b');
      expect(store.getState().library.pendingDelete).toBeNull();
    });

    it('restores optimistically at the old index before the refetch lands', () => {
      const a = noteDTO({ id: 'a' });
      const b = noteDTO({ id: 'b' });
      const c = noteDTO({ id: 'c' });
      const next = libraryReducer(
        stateWith({ notes: [a, c], selectedId: 'a', pendingDelete: { note: b, index: 1 } }),
        libraryActions.restoreDeleted(),
      );
      expect(next.notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
      expect(next.selectedId).toBe('b');
      expect(next.pendingDelete).toBeNull();
    });

    it('clamps the restore index when the list shrank meanwhile', () => {
      const a = noteDTO({ id: 'a' });
      const z = noteDTO({ id: 'z' });
      const next = libraryReducer(
        stateWith({ notes: [a], pendingDelete: { note: z, index: 5 } }),
        libraryActions.restoreDeleted(),
      );
      expect(next.notes.map((n) => n.id)).toEqual(['a', 'z']);
    });

    it('does nothing when there is no pending delete', async () => {
      const a = noteDTO({ id: 'a' });
      store = makeStore(stateWith({ notes: [a], selectedId: 'a' }));

      await store.dispatch(undoDelete());

      expect(api.notes.list).not.toHaveBeenCalled();
      expect(store.getState().library.notes).toEqual([a]);
    });
  });

  describe('fetchNotes while a delete is pending', () => {
    it('keeps the pending note out of a refreshed list', async () => {
      const a = noteDTO({ id: 'a' });
      const b = noteDTO({ id: 'b' });
      (api.notes.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([a, b]);
      store = makeStore(
        stateWith({ notes: [a], selectedId: 'a', pendingDelete: { note: b, index: 1 } }),
      );

      await store.dispatch(fetchNotes());

      expect(store.getState().library.notes.map((n) => n.id)).toEqual(['a']);
    });
  });
});

describe('libraryReducer — pending-delete edges', () => {
  describe('restoreDeleted', () => {
    it('is a no-op when nothing is pending, whatever is selected', () => {
      const a = noteDTO({ id: 'a' });
      const before = stateWith({ notes: [a], selectedId: 'a' });
      expect(libraryReducer(before, libraryActions.restoreDeleted())).toEqual(before);
    });

    it('does not duplicate a note that is already back in the list, but still selects it', () => {
      const a = noteDTO({ id: 'a' });
      const b = noteDTO({ id: 'b' });
      const next = libraryReducer(
        stateWith({ notes: [a, b], selectedId: 'a', pendingDelete: { note: b, index: 1 } }),
        libraryActions.restoreDeleted(),
      );
      expect(next.notes.map((n) => n.id)).toEqual(['a', 'b']);
      expect(next.selectedId).toBe('b');
      expect(next.pendingDelete).toBeNull();
    });
  });

  describe('clearPendingDelete', () => {
    it('forgets the pending delete of the committed id', () => {
      const b = noteDTO({ id: 'b' });
      const next = libraryReducer(
        stateWith({ pendingDelete: { note: b, index: 0 } }),
        libraryActions.clearPendingDelete('b'),
      );
      expect(next.pendingDelete).toBeNull();
    });

    it('keeps a newer pending delete when a stale commit for an older note arrives', () => {
      const newer = { note: noteDTO({ id: 'new' }), index: 0 };
      const next = libraryReducer(
        stateWith({ pendingDelete: newer }),
        libraryActions.clearPendingDelete('old'),
      );
      expect(next.pendingDelete).toEqual(newer);
    });

    it('is a no-op with nothing pending', () => {
      const before = stateWith({});
      expect(libraryReducer(before, libraryActions.clearPendingDelete('x'))).toEqual(before);
    });
  });

  describe('stageDelete', () => {
    it('remembers the index so undo can put the note back in place', () => {
      const [a, b, c] = ['a', 'b', 'c'].map((id) => noteDTO({ id }));
      const next = libraryReducer(
        stateWith({ notes: [a!, b!, c!], selectedId: 'a' }),
        libraryActions.stageDelete('c'),
      );
      expect(next.pendingDelete).toEqual({ note: c, index: 2 });
      expect(next.notes.map((n) => n.id)).toEqual(['a', 'b']);
    });

    it('ignores an unknown id and keeps the existing pending delete', () => {
      const pending = { note: noteDTO({ id: 'p' }), index: 0 };
      const before = stateWith({ notes: [noteDTO({ id: 'a' })], pendingDelete: pending });
      expect(libraryReducer(before, libraryActions.stageDelete('ghost'))).toEqual(before);
    });
  });
});

describe('toggleNotePin / fetchNotes edges', () => {
  let api: InmemnoteAPI;
  beforeEach(() => {
    api = installInmemnoteApiMock();
  });

  it('ignores a pin response for a note that is no longer in the list', async () => {
    const a = noteDTO({ id: 'a' });
    (api.notes.togglePin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      noteDTO({ id: 'ghost', pinned: true }),
    );
    const store = makeStore(stateWith({ notes: [a] }));

    await store.dispatch(toggleNotePin('ghost'));

    expect(store.getState().library.notes).toEqual([a]);
  });

  it('keeps the pending note hidden from search results too', async () => {
    const a = noteDTO({ id: 'a' });
    const b = noteDTO({ id: 'b' });
    (api.notes.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([a, b]);
    const store = makeStore(
      stateWith({ query: 'x', notes: [a], selectedId: 'a', pendingDelete: { note: b, index: 1 } }),
    );

    await store.dispatch(fetchNotes());

    expect(store.getState().library.notes.map((n) => n.id)).toEqual(['a']);
  });
});

// The sidebar counts the whole Library, not the visible slice: `catalog` is
// fetched unfiltered and patched locally between `notes:changed` broadcasts.
describe('catalog (sidebar totals)', () => {
  let api: InmemnoteAPI;

  beforeEach(() => {
    api = installInmemnoteApiMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchCatalog lists every note, whatever the filter or search', async () => {
    (api.notes.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      noteDTO({ id: 'a', pinned: true }),
      noteDTO({ id: 'b', pinned: false }),
    ]);
    const store = makeStore(stateWith({ filter: 'pinned', query: 'zzz' }));

    await store.dispatch(fetchCatalog());

    expect(api.notes.list).toHaveBeenCalledWith('all');
    expect(api.notes.search).not.toHaveBeenCalled();
    expect(store.getState().library.catalog).toEqual([
      { id: 'a', pinned: true },
      { id: 'b', pinned: false },
    ]);
  });

  it('a created note is counted at once', async () => {
    (api.notes.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(noteDTO({ id: 'new' }));
    const store = makeStore(stateWith({ catalog: [{ id: 'old', pinned: false }] }));

    await store.dispatch(createNote());

    expect(store.getState().library.catalog).toEqual([
      { id: 'new', pinned: false },
      { id: 'old', pinned: false },
    ]);
  });

  it('a pin toggle moves the note between the counts, even when it is not visible', async () => {
    (api.notes.togglePin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      noteDTO({ id: 'a', pinned: true }),
    );
    const store = makeStore(stateWith({ notes: [], catalog: [{ id: 'a', pinned: false }] }));

    await store.dispatch(toggleNotePin('a'));

    expect(store.getState().library.catalog).toEqual([{ id: 'a', pinned: true }]);
  });

  it('committing a delete drops the note from the catalog', async () => {
    const a = noteDTO({ id: 'a' });
    const store = makeStore(
      stateWith({
        catalog: [
          { id: 'a', pinned: false },
          { id: 'b', pinned: false },
        ],
        pendingDelete: { note: a, index: 0 },
      }),
    );

    await store.dispatch(commitDelete('a'));

    expect(store.getState().library.catalog).toEqual([{ id: 'b', pinned: false }]);
  });

  it('a second delete drops the first (now committed) note from the catalog', async () => {
    const a = noteDTO({ id: 'a' });
    const b = noteDTO({ id: 'b' });
    const store = makeStore(
      stateWith({
        notes: [b],
        catalog: [
          { id: 'a', pinned: false },
          { id: 'b', pinned: false },
        ],
        pendingDelete: { note: a, index: 0 },
      }),
    );

    await store.dispatch(deleteNote('b'));

    // `b` is only pending (the sidebar hides it); `a` is gone for good.
    expect(store.getState().library.catalog).toEqual([{ id: 'b', pinned: false }]);
  });
});
