import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Redux slice mirroring the current Draft on screen.
 *
 * The renderer treats this as a read-cache of what's in storage; writes go
 * through the IPC bridge (which then notifies us back via async thunks). The
 * slice itself is intentionally tiny — orchestration belongs to use-cases on
 * the main process side, not to reducers.
 */
export interface DraftState {
  id: string | null;
  content: string;
  pinned: boolean;
  updatedAt: string | null;
  // True while we're waiting on an IPC round-trip (initial open or save).
  loading: boolean;
}

const initialState: DraftState = {
  id: null,
  content: '',
  pinned: false,
  updatedAt: null,
  loading: false,
};

export const draftSlice = createSlice({
  name: 'draft',
  initialState,
  reducers: {
    /** Replace the in-memory draft state from an IPC DTO (open/save/togglePin). */
    setDraft(state, action: PayloadAction<{ id: string; content: string; pinned: boolean; updatedAt: string }>) {
      state.id = action.payload.id;
      state.content = action.payload.content;
      state.pinned = action.payload.pinned;
      state.updatedAt = action.payload.updatedAt;
      state.loading = false;
    },
    /** Local-only edit. Persistence is triggered by the autosave hook. */
    editContent(state, action: PayloadAction<string>) {
      state.content = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    clear(state) {
      state.id = null;
      state.content = '';
      state.pinned = false;
      state.updatedAt = null;
      state.loading = false;
    },
  },
});

export const draftActions = draftSlice.actions;
export const draftReducer = draftSlice.reducer;
