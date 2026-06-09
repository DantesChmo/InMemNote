import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type {
  AppSettingsDTO,
  AppSettingsPatchDTO,
} from '@infrastructure/electron/ipc-channels';

/**
 * Settings view-state.
 *
 * Source-of-truth still lives in main (and in SQLite behind it). The renderer
 * keeps a synchronous cache so the popup can render without flicker and so the
 * theme/palette can be re-applied to the DOM on every change without an IPC
 * round-trip.
 *
 * `popupOpen` lives here too because it's UI state that belongs to "settings"
 * conceptually — putting it in `library` would force the LibraryToolbar to
 * reach across slices to toggle the modal.
 */
export interface SettingsState {
  current: AppSettingsDTO | null;
  loading: boolean;
  saving: boolean;
  popupOpen: boolean;
  error: string | null;
}

const initialState: SettingsState = {
  current: null,
  loading: false,
  saving: false,
  popupOpen: false,
  error: null,
};

export const fetchSettings = createAsyncThunk<AppSettingsDTO>(
  'settings/fetch',
  async () => window.inmemnote.settings.load(),
);

export const saveSettings = createAsyncThunk<AppSettingsDTO, AppSettingsPatchDTO>(
  'settings/save',
  async (patch) => window.inmemnote.settings.save(patch),
);

export const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    openPopup(state) {
      state.popupOpen = true;
      state.error = null;
    },
    closePopup(state) {
      state.popupOpen = false;
      state.error = null;
    },
    /**
     * Replace the cached settings without an IPC call. Used by the broadcast
     * subscriber so a save initiated in another window updates this one too.
     */
    setFromBroadcast(state, action: PayloadAction<AppSettingsDTO>) {
      state.current = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.current = action.payload;
        state.loading = false;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load settings';
      })
      .addCase(saveSettings.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(saveSettings.fulfilled, (state, action) => {
        state.current = action.payload;
        state.saving = false;
      })
      .addCase(saveSettings.rejected, (state, action) => {
        state.saving = false;
        state.error = action.error.message ?? 'Failed to save settings';
      });
  },
});

export const settingsActions = settingsSlice.actions;
export const settingsReducer = settingsSlice.reducer;
