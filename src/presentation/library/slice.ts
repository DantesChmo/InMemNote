import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { NoteDTO, NoteListFilterDTO } from '@infrastructure/electron/ipc-channels';

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
}

const initialState: LibraryState = {
  notes: [],
  filter: 'all',
  query: '',
  selectedId: null,
  loading: false,
  error: null,
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

export const deleteNote = createAsyncThunk<string, string>('library/deleteNote', async (id) => {
  await window.inmemnote.notes.delete(id);
  return id;
});

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
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotes.fulfilled, (state, action) => {
        state.notes = action.payload;
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
      })
      .addCase(deleteNote.fulfilled, (state, action) => {
        state.notes = state.notes.filter((n) => n.id !== action.payload);
        if (state.selectedId === action.payload) {
          state.selectedId = state.notes[0]?.id ?? null;
        }
      });
  },
});

export const libraryActions = librarySlice.actions;
export const libraryReducer = librarySlice.reducer;
