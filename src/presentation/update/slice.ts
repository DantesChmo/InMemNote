import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AvailableUpdateDTO } from '@infrastructure/electron/ipc-channels';

/**
 * Auto-update view-state.
 *
 * The source of truth is the main process (it owns the release feed and the
 * installer). The renderer only mirrors "is there an update, and where are we
 * in the download". `available` drives the banner's visibility; `phase` +
 * `progress` drive what the banner shows once the user clicks Update.
 */
export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'error';

export interface UpdateState {
  available: AvailableUpdateDTO | null;
  phase: UpdatePhase;
  /** Download completion, 0..1. Only meaningful while `phase === 'downloading'`. */
  progress: number;
  error: string | null;
}

const initialState: UpdateState = {
  available: null,
  phase: 'idle',
  progress: 0,
  error: null,
};

export const checkForUpdate = createAsyncThunk<AvailableUpdateDTO | null>(
  'update/check',
  async () => window.inmemnote.update.check(),
);

export const installUpdate = createAsyncThunk<void>('update/install', async () => {
  await window.inmemnote.update.install();
});

export const updateSlice = createSlice({
  name: 'update',
  initialState,
  reducers: {
    /** A newer release arrived via the main-process broadcast. */
    setAvailable(state, action: PayloadAction<AvailableUpdateDTO>) {
      state.available = action.payload;
      state.error = null;
    },
    /** Download progress relayed from the installer (0..1). */
    setProgress(state, action: PayloadAction<number>) {
      state.progress = action.payload;
    },
    /** User dismissed the banner ("Later"). The next periodic check re-surfaces it. */
    dismiss(state) {
      state.available = null;
      state.phase = 'idle';
      state.progress = 0;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkForUpdate.pending, (state) => {
        state.phase = 'checking';
      })
      .addCase(checkForUpdate.fulfilled, (state, action) => {
        state.phase = 'idle';
        if (action.payload) state.available = action.payload;
      })
      // A failed check is soft — stay quiet, the interval retries.
      .addCase(checkForUpdate.rejected, (state) => {
        state.phase = 'idle';
      })
      .addCase(installUpdate.pending, (state) => {
        state.phase = 'downloading';
        state.progress = 0;
        state.error = null;
      })
      // On success the app is already quitting for the swap; nothing to do.
      .addCase(installUpdate.rejected, (state, action) => {
        state.phase = 'error';
        state.error = action.error.message ?? 'Update failed';
      });
  },
});

export const updateActions = updateSlice.actions;
export const updateReducer = updateSlice.reducer;
