import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import type { DegradedStoreDTO, StorageStatusDTO } from '@infrastructure/electron/ipc-channels';

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
});

export const storageReducer = storageSlice.reducer;
