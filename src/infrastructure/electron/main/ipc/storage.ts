import { IPC, type StorageStatusDTO } from '@shared/ipc';
import { ipcMain } from 'electron';

import type { StorageHealth } from '@infrastructure/persistence/StorageHealthMonitor';

/**
 * Storage-health IPC.
 *
 * Registers `storage:status`, which tells a renderer which repositories fell
 * back to in-memory at boot. The health snapshot is computed once by the
 * composition root and never changes, so the handler is a pure read with no
 * inbound payload to validate.
 */
export function registerStorageIpc(deps: {
  storage: StorageHealth;
  emitStorageChanged: (status: StorageStatusDTO) => void;
}): void {
  ipcMain.handle(
    IPC.StorageStatus,
    (): StorageStatusDTO => ({ degraded: deps.storage.degraded.map((d) => ({ ...d })) }),
  );
}
