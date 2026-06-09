import { join } from 'node:path';

import { BrowserWindow } from 'electron';

import { loadRenderer } from '../renderer';

/**
 * Owns the Library window's lifecycle.
 *
 * The Library is the "main" application window: visible Dock icon, opens
 * at startup, normal title bar. Created lazily so that workflows where the
 * user never opens Library (Draft-only via the global hotkey) don't pay
 * the cost upfront.
 */
export class LibraryWindowController {
  private win: BrowserWindow | null = null;

  /**
   * Bring the Library to the foreground, creating it if it doesn't exist
   * (or was closed). On subsequent calls — when the window is already
   * around — just focus it (and un-minimize, since dock clicks happen on
   * minimized windows too).
   */
  openOrFocus(): void {
    if (this.win && !this.win.isDestroyed()) {
      if (this.win.isMinimized()) this.win.restore();
      this.win.focus();
      return;
    }
    this.win = this.createWindow();
  }

  /** `null` when the window has never been opened or was closed. */
  webContents(): Electron.WebContents | null {
    if (!this.win || this.win.isDestroyed()) return null;
    return this.win.webContents;
  }

  /**
   * `null` until the user opens the Library at least once. Exposed so the
   * IPC broadcast layer can detect "is Library open?" and so the bootstrap
   * code can subscribe to `did-finish-load`.
   */
  browserWindow(): BrowserWindow | null {
    if (!this.win || this.win.isDestroyed()) return null;
    return this.win;
  }

  private createWindow(): BrowserWindow {
    const w = new BrowserWindow({
      width: 1100,
      height: 720,
      minWidth: 720,
      minHeight: 480,
      title: 'Inmemnote',
      // keeps native traffic lights but hides the bar
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#1c1b18',
      show: false,
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    loadRenderer(w, 'library');
    w.once('ready-to-show', () => w.show());
    w.on('closed', () => {
      this.win = null;
    });
    return w;
  }
}
