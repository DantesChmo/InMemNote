import { IPC, type StorageStatusDTO } from '@shared/ipc';
import { ipcMain } from 'electron';

import type { StorageHealth } from '@infrastructure/persistence/StorageHealthMonitor';

/**
 * Storage-health IPC.
 *
 * `storage:status` answers which stores are not reaching disk right now —
 * a pure read with no inbound payload to validate. Boot-time fallbacks are
 * already there when the renderer first asks; a store that degrades later
 * (a write failed, ADR 0008) is pushed to every window as `storage:changed`
 * so the warning appears without the renderer polling.
 */
export function registerStorageIpc(deps: {
  storage: StorageHealth;
  emitStorageChanged: (status: StorageStatusDTO) => void;
}): void {
  const { storage, emitStorageChanged } = deps;
  const snapshot = (): StorageStatusDTO => ({ degraded: storage.degraded.map((d) => ({ ...d })) });

  ipcMain.handle(IPC.StorageStatus, snapshot);
  storage.onChange(() => emitStorageChanged(snapshot()));
}
