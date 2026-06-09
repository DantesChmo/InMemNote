import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LibraryWindowController as LibraryWindowControllerCtor } from '../../windows/LibraryWindowController';

/**
 * BrowserWindow stand-in. Constructor double tracks created instances so a
 * test can assert "exactly one window was created" and inspect the options
 * that were passed.
 */
interface MockWin {
  loadURL: ReturnType<typeof vi.fn>;
  loadFile: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  webContents: {
    on: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
  };
  _opts: Record<string, unknown>;
  _onClosed: (() => void) | null;
  _onReadyToShow: (() => void) | null;
}

const created: MockWin[] = [];

function makeWin(opts: Record<string, unknown>): MockWin {
  const w: MockWin = {
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    show: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    isMinimized: vi.fn().mockReturnValue(false),
    once: vi.fn((event: string, cb: () => void) => {
      if (event === 'ready-to-show') w._onReadyToShow = cb;
    }),
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'closed') w._onClosed = cb;
    }),
    webContents: {
      on: vi.fn(),
      send: vi.fn(),
      once: vi.fn(),
    },
    _opts: opts,
    _onClosed: null,
    _onReadyToShow: null,
  };
  created.push(w);
  return w;
}

vi.mock('electron', () => ({
  BrowserWindow: vi.fn((opts: Record<string, unknown>) => makeWin(opts)),
}));

let LibraryWindowController: typeof LibraryWindowControllerCtor;

beforeEach(async () => {
  created.length = 0;
  vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
  vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
  ({ LibraryWindowController } = await import('../../windows/LibraryWindowController'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LibraryWindowController', () => {
  it('creates a window with the expected options on first openOrFocus', () => {
    const c = new LibraryWindowController();
    expect(c.browserWindow()).toBeNull();
    expect(c.webContents()).toBeNull();

    c.openOrFocus();

    expect(created).toHaveLength(1);
    const opts = created[0]!._opts;
    expect(opts.width).toBe(1100);
    expect(opts.height).toBe(720);
    expect(opts.titleBarStyle).toBe('hiddenInset');
    expect(opts.show).toBe(false);
    expect(c.browserWindow()).toBe(created[0]);
    expect(c.webContents()).toBe(created[0]!.webContents);
  });

  it('shows the window when ready-to-show fires', () => {
    const c = new LibraryWindowController();
    c.openOrFocus();
    const w = created[0]!;
    expect(w.show).not.toHaveBeenCalled();
    w._onReadyToShow!();
    expect(w.show).toHaveBeenCalledOnce();
  });

  it('focuses the existing window on subsequent openOrFocus', () => {
    const c = new LibraryWindowController();
    c.openOrFocus();
    c.openOrFocus();
    expect(created).toHaveLength(1);
    expect(created[0]!.focus).toHaveBeenCalledOnce();
    expect(created[0]!.restore).not.toHaveBeenCalled();
  });

  it('restores a minimized window before focusing', () => {
    const c = new LibraryWindowController();
    c.openOrFocus();
    created[0]!.isMinimized.mockReturnValue(true);
    c.openOrFocus();
    expect(created[0]!.restore).toHaveBeenCalledOnce();
    expect(created[0]!.focus).toHaveBeenCalledOnce();
  });

  it('recreates the window after closure', () => {
    const c = new LibraryWindowController();
    c.openOrFocus();
    created[0]!._onClosed!();
    expect(c.browserWindow()).toBeNull();

    c.openOrFocus();
    expect(created).toHaveLength(2);
  });

  it('returns null from browserWindow/webContents when destroyed', () => {
    const c = new LibraryWindowController();
    c.openOrFocus();
    created[0]!.isDestroyed.mockReturnValue(true);
    expect(c.browserWindow()).toBeNull();
    expect(c.webContents()).toBeNull();
  });
});
