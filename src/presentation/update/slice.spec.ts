import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installInmemnoteApiMock } from '../../test/mockInmemnoteApi';

import {
  checkForUpdate,
  installUpdate,
  updateActions,
  updateReducer,
  type UpdateState,
} from './slice';

import type { AvailableUpdateDTO } from '@infrastructure/electron/ipc-channels';

const dto: AvailableUpdateDTO = {
  version: '0.6.0',
  downloadUrl: 'https://x/0.6.0.dmg',
  notesUrl: 'https://x/0.6.0',
};

const initial: UpdateState = { available: null, phase: 'idle', progress: 0, error: null };
const stateWith = (over: Partial<UpdateState> = {}): UpdateState => ({ ...initial, ...over });

const makeStore = () => configureStore({ reducer: { update: updateReducer } });

describe('update slice — reducers', () => {
  it('setAvailable stores the release and clears any error', () => {
    const next = updateReducer(stateWith({ error: 'boom' }), updateActions.setAvailable(dto));
    expect(next.available).toEqual(dto);
    expect(next.error).toBeNull();
  });

  it('setProgress records the fraction', () => {
    const next = updateReducer(initial, updateActions.setProgress(0.42));
    expect(next.progress).toBe(0.42);
  });

  it('dismiss resets everything to idle', () => {
    const next = updateReducer(
      stateWith({ available: dto, phase: 'error', progress: 0.5, error: 'x' }),
      updateActions.dismiss(),
    );
    expect(next).toEqual(initial);
  });
});

describe('update slice — thunks', () => {
  let api: ReturnType<typeof installInmemnoteApiMock>;

  beforeEach(() => {
    api = installInmemnoteApiMock();
  });
  afterEach(() => vi.restoreAllMocks());

  it('checkForUpdate stores a found release', async () => {
    (api.update.check as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dto);
    const store = makeStore();
    await store.dispatch(checkForUpdate());
    expect(store.getState().update.available).toEqual(dto);
    expect(store.getState().update.phase).toBe('idle');
  });

  it('checkForUpdate leaves the banner hidden when up to date', async () => {
    (api.update.check as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const store = makeStore();
    await store.dispatch(checkForUpdate());
    expect(store.getState().update.available).toBeNull();
  });

  it('a failed check is soft (phase returns to idle, no error shown)', async () => {
    (api.update.check as ReturnType<typeof vi.fn>).mockRejectedValueOnce({});
    const store = makeStore();
    await store.dispatch(checkForUpdate());
    expect(store.getState().update.phase).toBe('idle');
    expect(store.getState().update.error).toBeNull();
  });

  it('installUpdate enters downloading, then error on failure', async () => {
    (api.update.install as ReturnType<typeof vi.fn>).mockRejectedValueOnce({});
    const store = makeStore();
    await store.dispatch(installUpdate());
    expect(store.getState().update.phase).toBe('error');
  });
});
