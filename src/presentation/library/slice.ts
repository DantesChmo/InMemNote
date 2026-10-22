import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { NoteDTO, NoteListFilterDTO } from '@shared/ipc';

/**
 * A note the user deleted but can still take back.
 *
 * Deletion is deferred, not reversed: the note leaves the list at once but
 * stays in the store (and in SQLite) until `commitDelete` runs — when the
 * undo toast times out, the window unloads, or another note is deleted.
 * `index` is where the note sat in `notes`, so undo can put it back in place.
 */
export interface PendingDelete {
  note: NoteDTO;
  index: number;
}

/**
 * Library view-state.
 *
 * The renderer keeps an authoritative copy of the visible notes; mutations go
 * through IPC and resync via `setList`. We don't store the editor body here
 * separately — the selected note's `content` field IS the editor's value, and
 * autosave debounces a single thunk.
 */
export interface LibraryState {
  notes: NoteDTO[];
  filter: NoteListFilterDTO;
  query: string;
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  pendingDelete: PendingDelete | null;
}

const initialState: LibraryState = {
  notes: [],
  filter: 'all',
  query: '',
  selectedId: null,
  loading: false,
  error: null,
  pendingDelete: null,
};

// ---------- Thunks ----------

export const fetchNotes = createAsyncThunk<NoteDTO[], void, { state: { library: LibraryState } }>(
  'library/fetchNotes',
  async (_arg, { getState }) => {
    const { filter, query } = getState().library;
    if (query.trim()) return window.inmemnote.notes.search(query.trim());
    return window.inmemnote.notes.list(filter);
  },
);

export const createNote = createAsyncThunk<NoteDTO>('library/createNote', async () => {
  return window.inmemnote.notes.create();
});

export const saveNote = createAsyncThunk<NoteDTO, { id: string; content: string }>(
  'library/saveNote',
  async ({ id, content }) => window.inmemnote.notes.save(id, content),
);

export const toggleNotePin = createAsyncThunk<NoteDTO, string>(
  'library/toggleNotePin',
  async (id) => window.inmemnote.notes.togglePin(id),
);

type ThunkApi = { state: { library: LibraryState } };

/**
 * Soft-delete: hide the note and make it the pending delete. Only one delete
 * is undoable at a time, so a still-pending previous one is committed here.
 */
export const deleteNote = createAsyncThunk<void, string, ThunkApi>(
  'library/deleteNote',
  async (id, { dispatch, getState }) => {
    const previous = getState().library.pendingDelete;
    dispatch(librarySlice.actions.stageDelete(id));
    // `stageDelete` already replaced the slot, so commit the old one directly.
    if (previous && previous.note.id !== id) await window.inmemnote.notes.delete(previous.note.id);
  },
);

/**
 * Make the pending delete of `id` permanent. A no-op when `id` is no longer
 * pending (undone, or already committed by another trigger), so the toast
 * timer and the `beforeunload` hook can both fire safely.
 */
export const commitDelete = createAsyncThunk<void, string, ThunkApi>(
  'library/commitDelete',
  async (id, { dispatch, getState }) => {
    if (getState().library.pendingDelete?.note.id !== id) return;
    // Cleared before the IPC await so a second trigger in the same tick sees
    // nothing pending and doesn't send a duplicate delete.
    dispatch(librarySlice.actions.clearPendingDelete(id));
    await window.inmemnote.notes.delete(id);
  },
);

/** Bring the pending delete back, reselect it, and resync the list. */
export const undoDelete = createAsyncThunk<void, void, ThunkApi>(
  'library/undoDelete',
  async (_arg, { dispatch, getState }) => {
    if (!getState().library.pendingDelete) return;
    dispatch(librarySlice.actions.restoreDeleted());
    // The old index is only a guess once the filter or search changed while
    // the toast was up; the refetch puts the note where main says it belongs.
    await dispatch(fetchNotes());
  },
);

// ---------- Slice ----------

export const librarySlice = createSlice({
  name: 'library',
  initialState,
  reducers: {
    setFilter(state, action: PayloadAction<NoteListFilterDTO>) {
      state.filter = action.payload;
      state.query = ''; // switching filter clears search to avoid stale combined state
    },
    setQuery(state, action: PayloadAction<string>) {
      state.query = action.payload;
    },
    setSelected(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    /**
     * Local-only edit: bumps the `content` of the selected note WITHOUT
     * hitting IPC. The editor pushes this on every keystroke; the autosave
     * thunk fires after the 500ms debounce.
     */
    patchSelectedContent(state, action: PayloadAction<string>) {
      if (!state.selectedId) return;
      const note = state.notes.find((n) => n.id === state.selectedId);
      if (note) note.content = action.payload;
    },
    /** Hide a note and remember it as the pending delete (see `deleteNote`). */
    stageDelete(state, action: PayloadAction<string>) {
      const index = state.notes.findIndex((n) => n.id === action.payload);
      const note = state.notes[index];
      if (!note) return;
      state.notes.splice(index, 1);
      state.pendingDelete = { note, index };
      if (state.selectedId === action.payload) {
        state.selectedId = state.notes[0]?.id ?? null;
      }
    },
    /** Put the pending delete back at its old index and select it. */
    restoreDeleted(state) {
      const pending = state.pendingDelete;
      if (!pending) return;
      state.pendingDelete = null;
      if (!state.notes.some((n) => n.id === pending.note.id)) {
        state.notes.splice(Math.min(pending.index, state.notes.length), 0, pending.note);
      }
      state.selectedId = pending.note.id;
    },
    /** Forget the pending delete of the given id (it is being committed). */
    clearPendingDelete(state, action: PayloadAction<string>) {
      if (state.pendingDelete?.note.id === action.payload) state.pendingDelete = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotes.fulfilled, (state, action) => {
        // A soft-deleted note still exists in main until it is committed.
        const hidden = state.pendingDelete?.note.id;
        state.notes = action.payload.filter((n) => n.id !== hidden);
        state.loading = false;
        // Preserve selection if still present; otherwise pick the first.
        if (!state.notes.some((n) => n.id === state.selectedId)) {
          state.selectedId = state.notes[0]?.id ?? null;
        }
      })
      .addCase(fetchNotes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load notes';
      })
      .addCase(createNote.fulfilled, (state, action) => {
        state.notes.unshift(action.payload);
        state.selectedId = action.payload.id;
        state.query = '';
        state.filter = 'all';
      })
      .addCase(saveNote.fulfilled, (state, action) => {
        const idx = state.notes.findIndex((n) => n.id === action.payload.id);
        if (idx >= 0) state.notes[idx] = action.payload;
      })
      .addCase(toggleNotePin.fulfilled, (state, action) => {
        const idx = state.notes.findIndex((n) => n.id === action.payload.id);
        if (idx >= 0) state.notes[idx] = action.payload;
      });
  },
});

export const libraryActions = librarySlice.actions;
export const libraryReducer = librarySlice.reducer;
