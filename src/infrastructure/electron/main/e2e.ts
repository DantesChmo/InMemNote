import { ipcMain } from 'electron';

import type { DraftWindowController } from './windows/DraftWindowController';

/**
 * E2E-only affordances. Inert in production builds — only invoked when
 * the binary launches with `INMEMNOTE_E2E=1`.
 *
 * Two channels and one global handle:
 *   - `__test__:showDraft` / `__test__:hideDraft` — IPC stubs Playwright
 *     can `invoke` to summon and dismiss the Draft overlay without
 *     dispatching a real system-wide hotkey (Playwright can't trigger
 *     `CommandOrControl+Shift+Space` at the OS level).
 *   - `globalThis.__inmemnoteTest` — Playwright's `app.evaluate` runs
 *     inside the main process and can read globals directly. Exposing
 *     the toggle as a plain function avoids round-tripping through
 *     `ipcRenderer`.
 */
export function registerE2eAffordances(controller: DraftWindowController): void {
  ipcMain.handle('__test__:showDraft', async (): Promise<void> => {
    controller.toggle();
  });
  ipcMain.handle('__test__:hideDraft', async (): Promise<void> => {
    if (controller.isVisible()) controller.browserWindow().hide();
  });
  (
    globalThis as {
      __inmemnoteTest?: { showDraft: () => void; hideDraft: () => void };
    }
  ).__inmemnoteTest = {
    showDraft: () => controller.toggle(),
    hideDraft: () => {
      if (controller.isVisible()) controller.browserWindow().hide();
    },
  };
}
