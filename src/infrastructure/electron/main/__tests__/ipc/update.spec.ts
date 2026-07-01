import { AppVersion } from '@domain/update/AppVersion';
import { IPC } from '@infrastructure/electron/ipc-channels';
import { err, ok, unwrap } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { registerUpdateIpc as RegisterUpdateIpcFn } from '../../ipc/update';
import type { ReleaseInfo } from '@domain/update/ReleaseInfo';

const ipcHandlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>();
const browserWindows: Array<{
  isDestroyed: ReturnType<typeof vi.fn>;
  webContents: { send: ReturnType<typeof vi.fn> };
}> = [];

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (e: unknown, ...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, cb);
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => browserWindows),
  },
}));

let registerUpdateIpc: typeof RegisterUpdateIpcFn;

const release: ReleaseInfo = {
  version: unwrap(AppVersion.create('0.6.0')),
  downloadUrl: 'https://x/0.6.0.dmg',
  notesUrl: 'https://x/0.6.0',
};

const makeWindow = (): {
  isDestroyed: ReturnType<typeof vi.fn>;
  webContents: { send: ReturnType<typeof vi.fn> };
} => ({ isDestroyed: vi.fn(() => false), webContents: { send: vi.fn() } });

beforeEach(async () => {
  ipcHandlers.clear();
  browserWindows.length = 0;
  ({ registerUpdateIpc } = await import('../../ipc/update'));
});

afterEach(() => vi.restoreAllMocks());

describe('registerUpdateIpc', () => {
  it('checkNow broadcasts update:available and returns the DTO when newer', async () => {
    const win = makeWindow();
    browserWindows.push(win);
    const handle = registerUpdateIpc({
      checkForUpdate: { execute: vi.fn(async () => ok(release)) } as never,
      installUpdate: { execute: vi.fn() } as never,
    });

    const dto = await handle.checkNow();

    expect(dto).toEqual({ version: '0.6.0', downloadUrl: release.downloadUrl, notesUrl: release.notesUrl });
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.UpdateAvailable, dto);
  });

  it('checkNow stays silent (no broadcast, null) when up to date', async () => {
    const win = makeWindow();
    browserWindows.push(win);
    const handle = registerUpdateIpc({
      checkForUpdate: { execute: vi.fn(async () => ok(null)) } as never,
      installUpdate: { execute: vi.fn() } as never,
    });

    expect(await handle.checkNow()).toBeNull();
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('checkNow swallows a soft check failure', async () => {
    const handle = registerUpdateIpc({
      checkForUpdate: { execute: vi.fn(async () => err(new Error('offline'))) } as never,
      installUpdate: { execute: vi.fn() } as never,
    });
    expect(await handle.checkNow()).toBeNull();
  });

  it('update:install installs the pending release', async () => {
    const install = vi.fn(async () => ok(undefined));
    registerUpdateIpc({
      checkForUpdate: { execute: vi.fn(async () => ok(release)) } as never,
      installUpdate: { execute: install } as never,
    });
    // Prime `pending` via a check first.
    await ipcHandlers.get(IPC.UpdateCheck)!({});
    await ipcHandlers.get(IPC.UpdateInstall)!({});
    expect(install).toHaveBeenCalledWith(release);
  });

  it('update:install is a no-op when nothing is pending', async () => {
    const install = vi.fn();
    registerUpdateIpc({
      checkForUpdate: { execute: vi.fn(async () => ok(null)) } as never,
      installUpdate: { execute: install } as never,
    });
    await ipcHandlers.get(IPC.UpdateInstall)!({});
    expect(install).not.toHaveBeenCalled();
  });

  it('update:install rejects when the install use-case fails', async () => {
    registerUpdateIpc({
      checkForUpdate: { execute: vi.fn(async () => ok(release)) } as never,
      installUpdate: { execute: vi.fn(async () => err(new Error('boom'))) } as never,
    });
    await ipcHandlers.get(IPC.UpdateCheck)!({});
    await expect(ipcHandlers.get(IPC.UpdateInstall)!({})).rejects.toThrow('boom');
  });
});
