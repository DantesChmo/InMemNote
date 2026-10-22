import { IPC, type StorageStatusDTO } from '@shared/ipc';
import { ipcMain } from 'electron';

import type { StorageHealth } from '../composition';

/**
 * Storage-health IPC.
 *
 * Registers `storage:status`, which tells a renderer which repositories fell
 * back to in-memory at boot. The health snapshot is computed once by the
 * composition root and never changes, so the handler is a pure read with no
 * inbound payload to validate.
 */
export function registerStorageIpc(deps: { storage: StorageHealth }): void {
  ipcMain.handle(
    IPC.StorageStatus,
    (): StorageStatusDTO => ({ degraded: deps.storage.degraded.map((d) => ({ ...d })) }),
  );
}
