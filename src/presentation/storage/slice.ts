import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import type { DegradedStoreDTO, StorageStatusDTO } from '@shared/ipc';

/**
 * Storage-health view-state.
 *
 * Mirrors main's answer to `storage:status`: which repositories are running
 * in-memory because SQLite failed to open. Non-empty `degraded` means the
 * user's writes are lost on quit, and drives the storage warning banner.
 */
export interface StorageState {
  degraded: DegradedStoreDTO[];
}

const initialState: StorageState = {
  degraded: [],
};

export const fetchStorageStatus = createAsyncThunk<StorageStatusDTO>(
  'storage/fetchStatus',
  async () => window.inmemnote.storage.status(),
);

export const storageSlice = createSlice({
  name: 'storage',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchStorageStatus.fulfilled, (state, action) => {
      state.degraded = action.payload.degraded;
    });
    // A failed status call is left alone: there is nothing actionable to
    // show, and a false alarm would be worse than the (unlikely) miss.
  },
});

export const storageReducer = storageSlice.reducer;
