import { StorageHealthMonitor } from '@infrastructure/persistence/StorageHealthMonitor';
import { IPC, type StorageStatusDTO } from '@shared/ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const status = async (): Promise<StorageStatusDTO> =>
  (await ipcHandlers.get(IPC.StorageStatus)!({})) as StorageStatusDTO;

describe('registerStorageIpc', () => {
  let storage: StorageHealthMonitor;
  let emitStorageChanged: ReturnType<typeof vi.fn<(s: StorageStatusDTO) => void>>;

  beforeEach(() => {
    storage = new StorageHealthMonitor();
    emitStorageChanged = vi.fn<(s: StorageStatusDTO) => void>();
  });

  it('registers the storage:status channel', () => {
    registerStorageIpc({ storage, emitStorageChanged });
    expect(IPC.StorageStatus).toBe('storage:status');
    expect(ipcHandlers.has(IPC.StorageStatus)).toBe(true);
  });

  it('answers an empty list when everything is persisted', async () => {
    registerStorageIpc({ storage, emitStorageChanged });
    expect(await status()).toEqual({ degraded: [] });
  });

  it('answers every degraded store with its reason', async () => {
    storage.markDegraded('drafts', new Error('no native'));
    storage.markDegraded('settings', new Error('SQLITE_CANTOPEN'));
    registerStorageIpc({ storage, emitStorageChanged });

    expect(await status()).toEqual({
      degraded: [
        { store: 'drafts', reason: 'no native' },
        { store: 'settings', reason: 'SQLITE_CANTOPEN' },
      ],
    });
  });

  it('hands out a copy, so a renderer-side mutation cannot leak back', async () => {
    storage.markDegraded('notes', new Error('x'));
    registerStorageIpc({ storage, emitStorageChanged });

    const dto = await status();
    dto.degraded.length = 0;

    expect((await status()).degraded).toHaveLength(1);
  });

  it('reflects a store that degraded after registration', async () => {
    registerStorageIpc({ storage, emitStorageChanged });

    storage.markDegraded('notes', new Error('database or disk is full'));

    expect(await status()).toEqual({
      degraded: [{ store: 'notes', reason: 'database or disk is full' }],
    });
  });

  it('broadcasts storage:changed with the full snapshot when a store degrades', () => {
    storage.markDegraded('settings', new Error('boot failure'));
    registerStorageIpc({ storage, emitStorageChanged });

    storage.markDegraded('notes', new Error('database or disk is full'));

    expect(IPC.StorageChanged).toBe('storage:changed');
    expect(emitStorageChanged).toHaveBeenCalledTimes(1);
    expect(emitStorageChanged).toHaveBeenCalledWith({
      degraded: [
        { store: 'settings', reason: 'boot failure' },
        { store: 'notes', reason: 'database or disk is full' },
      ],
    });
  });

  it('does not broadcast boot-time degradations (the renderer pulls those)', () => {
    storage.markDegraded('notes', new Error('SQLITE_CANTOPEN'));

    registerStorageIpc({ storage, emitStorageChanged });

    expect(emitStorageChanged).not.toHaveBeenCalled();
  });
});
