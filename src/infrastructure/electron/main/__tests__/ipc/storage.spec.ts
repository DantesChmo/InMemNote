import { IPC, type StorageStatusDTO } from '@infrastructure/electron/ipc-channels';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StorageHealth } from '../../composition';
import type { registerStorageIpc as RegisterStorageIpcFn } from '../../ipc/storage';

const ipcHandlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (e: unknown, ...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, cb);
    }),
  },
}));

let registerStorageIpc: typeof RegisterStorageIpcFn;

beforeEach(async () => {
  ipcHandlers.clear();
  ({ registerStorageIpc } = await import('../../ipc/storage'));
});

afterEach(() => vi.restoreAllMocks());

describe('registerStorageIpc', () => {
  it('registers the storage:status channel', () => {
    registerStorageIpc({ storage: { degraded: [] } });
    expect(IPC.StorageStatus).toBe('storage:status');
    expect(ipcHandlers.has(IPC.StorageStatus)).toBe(true);
  });

  it('answers an empty list when everything is persisted', async () => {
    registerStorageIpc({ storage: { degraded: [] } });
    const dto = (await ipcHandlers.get(IPC.StorageStatus)!({})) as StorageStatusDTO;
    expect(dto).toEqual({ degraded: [] });
  });

  it('answers every degraded store with its reason', async () => {
    const storage: StorageHealth = {
      degraded: [
        { store: 'drafts', reason: 'no native' },
        { store: 'settings', reason: 'SQLITE_CANTOPEN' },
      ],
    };
    registerStorageIpc({ storage });

    const dto = (await ipcHandlers.get(IPC.StorageStatus)!({})) as StorageStatusDTO;

    expect(dto).toEqual({
      degraded: [
        { store: 'drafts', reason: 'no native' },
        { store: 'settings', reason: 'SQLITE_CANTOPEN' },
      ],
    });
  });

  it('hands out a copy, so a renderer-side mutation cannot leak back', async () => {
    const storage: StorageHealth = { degraded: [{ store: 'notes', reason: 'x' }] };
    registerStorageIpc({ storage });

    const dto = (await ipcHandlers.get(IPC.StorageStatus)!({})) as StorageStatusDTO;
    dto.degraded.length = 0;

    const again = (await ipcHandlers.get(IPC.StorageStatus)!({})) as StorageStatusDTO;
    expect(again.degraded).toHaveLength(1);
  });
});
