import { IPC, type AvailableUpdateDTO } from '@infrastructure/electron/ipc-channels';
import { BrowserWindow, ipcMain } from 'electron';

import type { CheckForUpdateUseCase } from '@application/update/CheckForUpdateUseCase';
import type { InstallUpdateUseCase } from '@application/update/InstallUpdateUseCase';
import type { ReleaseInfo } from '@domain/update/ReleaseInfo';

/**
 * Auto-update IPC.
 *
 * Registers `update:check` (renderer-triggered) + `update:install`, and
 * exposes `checkNow()` for the main-process bootstrap to call on startup and
 * on the periodic timer. A found release is cached in closure so the install
 * handler has the domain object to hand to the use-case — the renderer only
 * ever sees the flat DTO.
 *
 * Failures on the check path stay silent (an offline machine isn't an error
 * the user needs to see); the install path rejects so the banner can show it.
 */
export interface UpdateIpcHandle {
  /** Run a check now; broadcast `update:available` if one is found. */
  checkNow(): Promise<AvailableUpdateDTO | null>;
}

const toDTO = (release: ReleaseInfo): AvailableUpdateDTO => ({
  version: release.version.toString(),
  downloadUrl: release.downloadUrl,
  notesUrl: release.notesUrl,
});

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

export function registerUpdateIpc(deps: {
  checkForUpdate: CheckForUpdateUseCase;
  installUpdate: InstallUpdateUseCase;
}): UpdateIpcHandle {
  // The most recent newer-than-us release, cached so `update:install` has the
  // domain object (with its download URL) without re-hitting the feed.
  let pending: ReleaseInfo | null = null;

  const checkNow = async (): Promise<AvailableUpdateDTO | null> => {
    const result = await deps.checkForUpdate.execute();
    // Soft failure (offline / rate-limited): keep quiet, retry next interval.
    if (!result.ok) return null;

    pending = result.value;
    if (!pending) return null;

    const dto = toDTO(pending);
    broadcast(IPC.UpdateAvailable, dto);
    return dto;
  };

  ipcMain.handle(IPC.UpdateCheck, () => checkNow());

  ipcMain.handle(IPC.UpdateInstall, async (): Promise<void> => {
    if (!pending) return;
    const result = await deps.installUpdate.execute(pending);
    // On success the app is already quitting (the helper takes over); we only
    // reach here on failure, which we surface as a rejected promise.
    if (!result.ok) throw new Error(result.error.message);
  });

  return { checkNow };
}
