import {
  IPC,
  type AppSettingsDTO,
  type AppSettingsPatchDTO,
} from '@infrastructure/electron/ipc-channels';
import { BrowserWindow, ipcMain } from 'electron';

import { settingsToDTO } from '../dto';

import type { UseCases } from '../composition';
import type { HotkeyService } from '../hotkey';
import type { AppSettings } from '@domain/settings/AppSettings';

/**
 * Handle to the registered settings IPC layer. The bootstrap code uses
 * `pushTo` to nudge a freshly-loaded renderer with the current settings,
 * so the renderer can apply the user's palette / theme on the very first
 * paint (before its own `settings.load` call resolves).
 */
export interface SettingsIpcHandle {
  pushTo(win: BrowserWindow): void;
}

/**
 * Register `IPC.SettingsLoad` and `IPC.SettingsSave`.
 *
 * The "current" settings live inside this module via closure — the
 * SettingsSave handler updates them in place after each successful
 * persist. Hotkey re-registration happens AFTER the DB write so a
 * failed registration (combo grabbed by another app) doesn't leave the
 * DB out of sync with reality.
 */
export function registerSettingsIpc(deps: {
  initial: AppSettings;
  uc: Pick<UseCases, 'updateSettings'>;
  hotkey: HotkeyService;
}): SettingsIpcHandle {
  let current = deps.initial;

  const broadcast = (dto: AppSettingsDTO): void => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(IPC.SettingsChanged, dto);
    }
  };

  ipcMain.handle(IPC.SettingsLoad, async (): Promise<AppSettingsDTO> => settingsToDTO(current));

  ipcMain.handle(
    IPC.SettingsSave,
    async (_e, patch: AppSettingsPatchDTO): Promise<AppSettingsDTO> => {
      // Merge the patch with the current aggregate so the popup can send
      // only the field(s) the user touched. The use-case re-validates
      // the result through the domain parser — never trust the
      // renderer's shape.
      const merged = {
        themeMode: patch.themeMode ?? current.themeMode,
        language: patch.language ?? current.language,
        palette: patch.palette ?? current.palette.toJSON(),
        openDraftHotkey: patch.openDraftHotkey ?? current.openDraftHotkey.accelerator,
      };
      const result = await deps.uc.updateSettings.execute(merged);
      if (!result.ok) throw new Error(result.error.message);

      const prevHotkey = current.openDraftHotkey.accelerator;
      current = result.value;

      // Hotkey changed — re-register the global shortcut AFTER the
      // persistence step succeeded.
      const nextHotkey = current.openDraftHotkey.accelerator;
      if (nextHotkey !== prevHotkey) deps.hotkey.register(nextHotkey);

      const dto = settingsToDTO(current);
      broadcast(dto);
      return dto;
    },
  );

  return {
    pushTo(win: BrowserWindow): void {
      if (win.isDestroyed()) return;
      win.webContents.send(IPC.SettingsChanged, settingsToDTO(current));
    },
  };
}
