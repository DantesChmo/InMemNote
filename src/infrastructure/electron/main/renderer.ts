import { join } from 'node:path';

import type { BrowserWindow } from 'electron';

/**
 * Renderer-loading helper for both windows.
 *
 * Two layout variants live in the same bundle, routed by `?view=` in the
 * URL — `App.tsx` reads the query string and picks the corresponding
 * top-level component.
 *
 * Dev: Vite serves the bundle via HTTP, so we append `?view=` to the URL.
 *
 * Prod: we use `loadFile(..., { query })` instead of `loadURL('file://...?q=')`.
 * Electron's `file://` parser drops the query string in some versions,
 * which silently broke the Draft window's renderer (it defaulted to
 * Library).
 */

// Vite-injected constants for the bundled renderer's entrypoint.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

export function loadRenderer(w: BrowserWindow, view: 'draft' | 'library'): void {
  // Diagnostic plumbing: surface renderer-side console + load failures into
  // the main process stdout. Without this, a blank window after `loadFile`
  // looks identical to a successful load.
  w.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`[renderer:${view}][${level}] ${source}:${line} ${message}`);
  });
  w.webContents.on('did-fail-load', (_e, errCode, errDesc, url) => {
    console.error(`[renderer:${view}] did-fail-load ${errCode} ${errDesc} url=${url}`);
  });
  w.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[renderer:${view}] render-process-gone`, details);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void w.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?view=${view}`);
    return;
  }
  const indexPath = join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
  void w.loadFile(indexPath, { query: { view } });
}
