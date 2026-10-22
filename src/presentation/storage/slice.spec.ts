import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installInmemnoteApiMock } from '../../test/mockInmemnoteApi';

import { fetchStorageStatus, storageReducer, type StorageState } from './slice';

import type { StorageStatusDTO } from '@infrastructure/electron/ipc-channels';

const initial: StorageState = { degraded: [] };
const stateWith = (over: Partial<StorageState> = {}): StorageState => ({ ...initial, ...over });

const makeStore = () => configureStore({ reducer: { storage: storageReducer } });

const degraded: StorageStatusDTO = {
  degraded: [
    { store: 'notes', reason: 'SQLITE_CANTOPEN' },
    { store: 'drafts', reason: 'SQLITE_CANTOPEN' },
  ],
};

describe('storage slice — reducers', () => {
  it('starts with nothing degraded', () => {
    expect(storageReducer(undefined, { type: '@@init' })).toEqual(initial);
  });

  it('fetchStorageStatus.fulfilled replaces the degraded list', () => {
    const next = storageReducer(
      stateWith({ degraded: [{ store: 'settings', reason: 'old' }] }),
      fetchStorageStatus.fulfilled(degraded, 'req'),
    );
    expect(next.degraded).toEqual(degraded.degraded);
  });

  it('fetchStorageStatus.rejected keeps the previous answer', () => {
    const prev = stateWith({ degraded: degraded.degraded });
    const next = storageReducer(prev, fetchStorageStatus.rejected(null, 'req'));
    expect(next).toEqual(prev);
  });
});

describe('storage slice — thunks', () => {
  let api: ReturnType<typeof installInmemnoteApiMock>;

  beforeEach(() => {
    api = installInmemnoteApiMock();
  });
  afterEach(() => vi.restoreAllMocks());

  it('fetchStorageStatus stores what main reports', async () => {
    (api.storage.status as ReturnType<typeof vi.fn>).mockResolvedValueOnce(degraded);
    const store = makeStore();
    await store.dispatch(fetchStorageStatus());
    expect(api.storage.status).toHaveBeenCalledTimes(1);
    expect(store.getState().storage.degraded).toEqual(degraded.degraded);
  });

  it('a failed status call stays quiet (nothing degraded is assumed)', async () => {
    (api.storage.status as ReturnType<typeof vi.fn>).mockRejectedValueOnce({});
    const store = makeStore();
    await store.dispatch(fetchStorageStatus());
    expect(store.getState().storage.degraded).toEqual([]);
  });
});
