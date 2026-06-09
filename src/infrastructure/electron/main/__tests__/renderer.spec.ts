import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadRenderer } from '../renderer';

function makeWindow(): {
  loadURL: ReturnType<typeof vi.fn>;
  loadFile: ReturnType<typeof vi.fn>;
  webContents: { on: ReturnType<typeof vi.fn> };
} {
  return {
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    webContents: { on: vi.fn() },
  };
}

describe('loadRenderer', () => {
  // The Vite-injected globals are declared via `declare const ...` in
  // the renderer module; in production they're rewritten at bundle time.
  // Under Vitest we have to provide them as real globals so the bare
  // identifier lookup doesn't throw `ReferenceError`.
  beforeEach(() => {
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
    vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wires console + load-fail diagnostics on every load', () => {
    const w = makeWindow();
    loadRenderer(w as unknown as Electron.BrowserWindow, 'draft');
    const events = w.webContents.on.mock.calls.map(([name]) => name);
    expect(events).toEqual(['console-message', 'did-fail-load', 'render-process-gone']);
  });

  it('loads dev URL with ?view= when the Vite server URL is present', () => {
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5173');
    const w = makeWindow();
    loadRenderer(w as unknown as Electron.BrowserWindow, 'draft');
    expect(w.loadURL).toHaveBeenCalledWith('http://localhost:5173?view=draft');
    expect(w.loadFile).not.toHaveBeenCalled();
  });

  it('loads file with query when no dev server URL is set', () => {
    const w = makeWindow();
    loadRenderer(w as unknown as Electron.BrowserWindow, 'library');
    expect(w.loadURL).not.toHaveBeenCalled();
    expect(w.loadFile).toHaveBeenCalledTimes(1);
    const call = w.loadFile.mock.calls[0]!;
    const [path, opts] = call;
    expect(path).toContain('main_window/index.html');
    expect(opts).toEqual({ query: { view: 'library' } });
  });
});
