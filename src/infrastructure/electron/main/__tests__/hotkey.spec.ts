import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HotkeyService as HotkeyServiceCtor } from '../hotkey';

const globalShortcutMock = {
  register: vi.fn().mockReturnValue(true),
  unregister: vi.fn(),
  unregisterAll: vi.fn(),
};

const appMock = {
  getAppPath: vi.fn(() => '/app'),
  getPath: vi.fn((key: string) => `/userData/${key}`),
};

vi.mock('electron', () => ({
  app: appMock,
  globalShortcut: globalShortcutMock,
}));

const loadHotkeysMock = vi.fn();
vi.mock('@infrastructure/config/HotkeysConfig', () => ({
  loadHotkeys: (...args: unknown[]) => loadHotkeysMock(...args),
}));

let HotkeyService: typeof HotkeyServiceCtor;

beforeEach(async () => {
  globalShortcutMock.register.mockReset().mockReturnValue(true);
  globalShortcutMock.unregister.mockReset();
  globalShortcutMock.unregisterAll.mockReset();
  loadHotkeysMock.mockReset().mockReturnValue({
    hotkeys: { openDraft: 'CommandOrControl+Shift+Space' },
    warning: null,
  });
  ({ HotkeyService } = await import('../hotkey'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HotkeyService.loadInitial', () => {
  it('prefers the DB accelerator when the settings row exists', () => {
    const trigger = vi.fn();
    const s = new HotkeyService(trigger);
    s.loadInitial({ dbAccelerator: 'Alt+Space', settingsRowExists: true });
    expect(globalShortcutMock.register).toHaveBeenCalledWith('Alt+Space', trigger);
  });

  it('falls back to the YAML accelerator when no DB row exists', () => {
    const trigger = vi.fn();
    const s = new HotkeyService(trigger);
    s.loadInitial({ dbAccelerator: 'Alt+Space', settingsRowExists: false });
    expect(globalShortcutMock.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+Space',
      trigger,
    );
  });

  it('falls back to YAML when the row exists but the DB accelerator is null', () => {
    const trigger = vi.fn();
    const s = new HotkeyService(trigger);
    s.loadInitial({ dbAccelerator: null, settingsRowExists: true });
    expect(globalShortcutMock.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+Space',
      trigger,
    );
  });

  it('logs a warning when loadHotkeys returns one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    loadHotkeysMock.mockReturnValue({
      hotkeys: { openDraft: 'CommandOrControl+Shift+Space' },
      warning: 'bad yaml',
    });
    new HotkeyService(vi.fn()).loadInitial({ dbAccelerator: null, settingsRowExists: false });
    expect(warn).toHaveBeenCalledWith('bad yaml');
  });
});

describe('HotkeyService.register', () => {
  it('unregisters the previous accelerator before registering the new one', () => {
    const s = new HotkeyService(vi.fn());
    s.register('Alt+1');
    s.register('Alt+2');
    expect(globalShortcutMock.unregister).toHaveBeenCalledWith('Alt+1');
    expect(globalShortcutMock.register).toHaveBeenLastCalledWith('Alt+2', expect.any(Function));
  });

  it('does not retain the accelerator when registration fails', () => {
    globalShortcutMock.register.mockReturnValueOnce(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = new HotkeyService(vi.fn());
    s.register('Bad+Combo');
    // Re-register should NOT call unregister with the failed key.
    s.register('Alt+X');
    expect(globalShortcutMock.unregister).not.toHaveBeenCalledWith('Bad+Combo');
    expect(warn).toHaveBeenCalled();
  });
});

describe('HotkeyService.unregisterAll', () => {
  it('clears every registration', () => {
    const s = new HotkeyService(vi.fn());
    s.register('Alt+1');
    s.unregisterAll();
    expect(globalShortcutMock.unregisterAll).toHaveBeenCalled();
    // After unregisterAll a subsequent register MUST NOT call unregister
    // on the previously-tracked combo — it was already wiped.
    globalShortcutMock.unregister.mockClear();
    s.register('Alt+2');
    expect(globalShortcutMock.unregister).not.toHaveBeenCalled();
  });
});
