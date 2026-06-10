// Unit tests for the settings slice.
//
// Two layers exercised here:
//   1. Reducers are tested as pure functions (no store).
//   2. Async thunks are tested through a real `configureStore({ settings:
//      settingsReducer })` so we can observe their effect via extraReducers.
//      `window.inmemnote` is replaced by `installInmemnoteApiMock()` and the
//      relevant settings methods are overridden per-test.
//
// What we deliberately don't do:
//   - render any React;
//   - import the renderer composition root (`@presentation/app/store`) — keeping
//     the store local makes the slice the unit under test rather than the whole
//     state shape;
//   - call IPC for real.
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installInmemnoteApiMock, settingsDTO } from '../../test/mockInmemnoteApi';

import {
  fetchSettings,
  saveSettings,
  settingsActions,
  settingsReducer,
  type SettingsState,
} from './slice';

import type {
  AppSettingsDTO,
  AppSettingsPatchDTO,
} from '@infrastructure/electron/ipc-channels';
import type { InmemnoteAPI } from '@infrastructure/electron/preload/index';



function makeStore() {
  return configureStore({ reducer: { settings: settingsReducer } });
}

type Store = ReturnType<typeof makeStore>;

const initialState: SettingsState = {
  current: null,
  loading: false,
  saving: false,
  popupOpen: false,
  error: null,
};

function stateWith(overrides: Partial<SettingsState>): SettingsState {
  return { ...initialState, ...overrides };
}

describe('settingsReducer — pure reducers', () => {
  it('returns the initial state for an unknown action', () => {
    expect(settingsReducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  it('openPopup marks the popup open and clears any prior error', () => {
    const previous = stateWith({ popupOpen: false, error: 'boom' });
    const next = settingsReducer(previous, settingsActions.openPopup());
    expect(next).toEqual<SettingsState>({ ...previous, popupOpen: true, error: null });
  });

  it('closePopup marks the popup closed and clears any prior error', () => {
    const previous = stateWith({ popupOpen: true, error: 'boom' });
    const next = settingsReducer(previous, settingsActions.closePopup());
    expect(next).toEqual<SettingsState>({ ...previous, popupOpen: false, error: null });
  });

  it('setFromBroadcast replaces the cached settings without touching other flags', () => {
    const previous = stateWith({ loading: true, saving: true, popupOpen: true });
    const dto = settingsDTO({ themeMode: 'dark' });

    const next = settingsReducer(previous, settingsActions.setFromBroadcast(dto));

    expect(next.current).toBe(dto);
    expect(next.loading).toBe(true);
    expect(next.saving).toBe(true);
    expect(next.popupOpen).toBe(true);
  });
});

describe('settings async thunks', () => {
  let api: InmemnoteAPI;
  let store: Store;

  beforeEach(() => {
    api = installInmemnoteApiMock();
    store = makeStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchSettings', () => {
    it('calls window.inmemnote.settings.load and stores the result on fulfilled', async () => {
      const dto = settingsDTO({ language: 'ru', themeMode: 'dark' });
      (api.settings.load as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dto);

      await store.dispatch(fetchSettings());

      expect(api.settings.load).toHaveBeenCalledTimes(1);
      expect(store.getState().settings.current).toEqual(dto);
      expect(store.getState().settings.loading).toBe(false);
      expect(store.getState().settings.error).toBeNull();
    });

    it('flips loading to true on pending and clears a stale error', async () => {
      // Seed an error from a previous failed fetch to prove pending wipes it.
      (api.settings.load as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('first'));
      await store.dispatch(fetchSettings());
      expect(store.getState().settings.error).toBe('first');

      let loadingDuringPending: boolean | null = null;
      let errorDuringPending: string | null | undefined = undefined;
      (api.settings.load as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        // Snapshot state *while* the thunk is in-flight (after pending, before fulfilled).
        loadingDuringPending = store.getState().settings.loading;
        errorDuringPending = store.getState().settings.error;
        return settingsDTO();
      });

      await store.dispatch(fetchSettings());

      expect(loadingDuringPending).toBe(true);
      expect(errorDuringPending).toBeNull();
    });

    it('captures the error message on rejected and resets loading', async () => {
      (api.settings.load as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('nope'));

      await store.dispatch(fetchSettings());

      expect(store.getState().settings.loading).toBe(false);
      expect(store.getState().settings.error).toBe('nope');
      expect(store.getState().settings.current).toBeNull();
    });

    it('falls back to a default error message when the rejection has none', async () => {
      // Reject with a bare object so `miniSerializeError` produces no `message`
      // field — that's the only branch where the `??` fallback fires.
      (api.settings.load as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        throw {};
      });

      await store.dispatch(fetchSettings());

      expect(store.getState().settings.error).toBe('Failed to load settings');
    });
  });

  describe('saveSettings', () => {
    it('forwards the patch to window.inmemnote.settings.save and stores the response', async () => {
      const patch: AppSettingsPatchDTO = { themeMode: 'light' };
      const responded: AppSettingsDTO = settingsDTO({ themeMode: 'light' });
      (api.settings.save as ReturnType<typeof vi.fn>).mockResolvedValueOnce(responded);

      await store.dispatch(saveSettings(patch));

      expect(api.settings.save).toHaveBeenCalledWith(patch);
      expect(store.getState().settings.current).toEqual(responded);
      expect(store.getState().settings.saving).toBe(false);
      expect(store.getState().settings.error).toBeNull();
    });

    it('flips saving to true on pending', async () => {
      let savingDuringPending: boolean | null = null;
      (api.settings.save as ReturnType<typeof vi.fn>).mockImplementationOnce(async (patch: AppSettingsPatchDTO) => {
        savingDuringPending = store.getState().settings.saving;
        return settingsDTO(patch);
      });

      await store.dispatch(saveSettings({ language: 'en' }));

      expect(savingDuringPending).toBe(true);
      expect(store.getState().settings.saving).toBe(false);
    });

    it('captures the error message on rejected and resets saving', async () => {
      (api.settings.save as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('disk full'));

      await store.dispatch(saveSettings({}));

      expect(store.getState().settings.saving).toBe(false);
      expect(store.getState().settings.error).toBe('disk full');
    });

    it('falls back to a default error message when the rejection has none', async () => {
      (api.settings.save as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        throw {};
      });

      await store.dispatch(saveSettings({}));

      expect(store.getState().settings.error).toBe('Failed to save settings');
    });
  });
});
