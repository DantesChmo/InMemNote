import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { DegradedStoreDTO, StorageStatusDTO } from '@shared/ipc';

/**
 * Storage-health view-state.
 *
 * Mirrors main's storage health: which stores are not reaching disk, either
 * because SQLite failed to open at boot (`storage:status`) or because a
 * write failed later (`storage:changed`, ADR 0008). Non-empty `degraded`
 * means the user's writes are lost on quit, and drives the warning banner.
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
  reducers: {
    /** A `storage:changed` broadcast from main (a store degraded after boot). */
    setStatus: (state, action: PayloadAction<StorageStatusDTO>) => {
      mergeDegraded(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchStorageStatus.fulfilled, (state, action) => {
      mergeDegraded(state, action.payload);
    });
    // A failed status call is left alone: there is nothing actionable to
    // show, and a false alarm would be worse than the (unlikely) miss.
  },
});

/**
 * Degradation only grows within a process lifetime, so snapshots are merged,
 * never replaced: a `storage:status` reply overtaken by a `storage:changed`
 * push must not hide a store already known to be failing. The first known
 * reason for a store is kept, matching main.
 */
function mergeDegraded(state: StorageState, status: StorageStatusDTO): void {
  for (const d of status.degraded) {
    if (!state.degraded.some((known) => known.store === d.store)) state.degraded.push(d);
  }
}

export const storageActions = storageSlice.actions;
export const storageReducer = storageSlice.reducer;
