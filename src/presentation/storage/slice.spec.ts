import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installInmemnoteApiMock } from '../../test/mockInmemnoteApi';

import { fetchStorageStatus, storageActions, storageReducer, type StorageState } from './slice';

import type { StorageStatusDTO } from '@shared/ipc';

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

  it('fetchStorageStatus.fulfilled takes the degraded list main reports', () => {
    const next = storageReducer(stateWith(), fetchStorageStatus.fulfilled(degraded, 'req'));
    expect(next.degraded).toEqual(degraded.degraded);
  });

  it('setStatus takes a storage:changed snapshot', () => {
    const next = storageReducer(stateWith(), storageActions.setStatus(degraded));
    expect(next.degraded).toEqual(degraded.degraded);
  });

  // Degradation only grows within a process lifetime, so an older answer
  // (a `storage:status` reply overtaken by a `storage:changed` push) must
  // not hide a store that is already known to be failing.
  it('never forgets a degraded store: an older, shorter snapshot is merged in', () => {
    const known = stateWith({ degraded: [{ store: 'notes', reason: 'database or disk is full' }] });

    const afterPull = storageReducer(known, fetchStorageStatus.fulfilled({ degraded: [] }, 'req'));
    const afterPush = storageReducer(
      known,
      storageActions.setStatus({ degraded: [{ store: 'drafts', reason: 'gone' }] }),
    );

    expect(afterPull.degraded).toEqual(known.degraded);
    expect(afterPush.degraded).toEqual([
      { store: 'notes', reason: 'database or disk is full' },
      { store: 'drafts', reason: 'gone' },
    ]);
  });

  it('keeps the first known reason for a store', () => {
    const known = stateWith({ degraded: [{ store: 'notes', reason: 'first' }] });
    const next = storageReducer(
      known,
      storageActions.setStatus({ degraded: [{ store: 'notes', reason: 'second' }] }),
    );
    expect(next.degraded).toEqual([{ store: 'notes', reason: 'first' }]);
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
