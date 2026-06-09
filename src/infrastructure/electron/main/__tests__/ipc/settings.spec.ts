import { AppSettings } from '@domain/settings/AppSettings';
import { Hotkey } from '@domain/settings/Hotkey';
import { IPC } from '@infrastructure/electron/ipc-channels';
import { ok, unwrap } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  SettingsIpcHandle,
  registerSettingsIpc as RegisterSettingsIpcFn,
} from '../../ipc/settings';

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

let registerSettingsIpc: typeof RegisterSettingsIpcFn;

beforeEach(async () => {
  ipcHandlers.clear();
  browserWindows.length = 0;
  ({ registerSettingsIpc } = await import('../../ipc/settings'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeBrowserWindow(destroyed = false): {
  isDestroyed: ReturnType<typeof vi.fn>;
  webContents: { send: ReturnType<typeof vi.fn> };
} {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: { send: vi.fn() },
  };
}

describe('registerSettingsIpc', () => {
  function setup(): {
    hotkey: { register: ReturnType<typeof vi.fn> };
    uc: { updateSettings: { execute: ReturnType<typeof vi.fn> } };
    initial: AppSettings;
    handle: SettingsIpcHandle;
  } {
    const initial = AppSettings.default();
    const uc = {
      updateSettings: {
        execute: vi.fn(async () => ok(initial)),
      },
    };
    const hotkey = { register: vi.fn() };
    const handle = registerSettingsIpc({
      initial,
      uc: uc as never,
      hotkey: hotkey as never,
    });
    return { initial, uc, hotkey, handle };
  }

  it('SettingsLoad returns the initial settings as DTO', async () => {
    setup();
    const dto = (await ipcHandlers.get(IPC.SettingsLoad)!({})) as { openDraftHotkey: string };
    expect(dto.openDraftHotkey).toBe('CommandOrControl+Shift+Space');
  });

  it('SettingsSave merges the patch, persists, broadcasts, and returns DTO', async () => {
    const { uc } = setup();
    const win = makeBrowserWindow();
    browserWindows.push(win);

    const dto = (await ipcHandlers.get(IPC.SettingsSave)!({}, { themeMode: 'dark' })) as {
      themeMode: string;
    };

    expect(uc.updateSettings.execute).toHaveBeenCalled();
    // First positional arg is the merged plain object — patch fields win,
    // untouched fields default to the current snapshot.
    const passed = uc.updateSettings.execute.mock.calls[0]![0] as {
      themeMode: string;
      openDraftHotkey: string;
    };
    expect(passed.themeMode).toBe('dark');
    expect(passed.openDraftHotkey).toBe('CommandOrControl+Shift+Space');

    expect(win.webContents.send).toHaveBeenCalledWith(IPC.SettingsChanged, expect.any(Object));
    expect(dto).toBeTruthy();
  });

  it('does not re-register the hotkey when accelerator stays the same', async () => {
    const { hotkey } = setup();
    await ipcHandlers.get(IPC.SettingsSave)!({}, { themeMode: 'light' });
    expect(hotkey.register).not.toHaveBeenCalled();
  });

  it('re-registers the hotkey only after persistence succeeds', async () => {
    const initial = AppSettings.default();
    // Set up an updateSettings that returns settings with a different hotkey.
    const newSettings = initial.withOpenDraftHotkey(unwrap(Hotkey.create('Alt+Space')));
    const uc = { updateSettings: { execute: vi.fn(async () => ok(newSettings)) } };
    const hotkey = { register: vi.fn() };
    registerSettingsIpc({ initial, uc: uc as never, hotkey: hotkey as never });

    await ipcHandlers.get(IPC.SettingsSave)!({}, { openDraftHotkey: 'Alt+Space' });
    expect(hotkey.register).toHaveBeenCalledWith('Alt+Space');
    // Order: persist first, then re-register.
    const persistCall = (uc.updateSettings.execute.mock.invocationCallOrder)[0]!;
    const registerCall = (hotkey.register.mock.invocationCallOrder)[0]!;
    expect(persistCall).toBeLessThan(registerCall);
  });

  it('SettingsSave throws when the use-case fails', async () => {
    const initial = AppSettings.default();
    const failingUc = {
      updateSettings: { execute: vi.fn(async () => ({ ok: false, error: new Error('bad') })) },
    };
    registerSettingsIpc({
      initial,
      uc: failingUc as never,
      hotkey: { register: vi.fn() } as never,
    });
    await expect(
      ipcHandlers.get(IPC.SettingsSave)!({}, { themeMode: 'dark' }),
    ).rejects.toThrow();
  });

  it('handle.pushTo sends settings to a live window and skips destroyed ones', () => {
    const { handle } = setup();
    const live = makeBrowserWindow(false);
    const dead = makeBrowserWindow(true);

    handle.pushTo(live as never);
    handle.pushTo(dead as never);

    expect(live.webContents.send).toHaveBeenCalledWith(IPC.SettingsChanged, expect.any(Object));
    expect(dead.webContents.send).not.toHaveBeenCalled();
  });
});
