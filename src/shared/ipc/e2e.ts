/**
 * Test-only IPC: registered by main and exposed by preload only when the app
 * runs with `INMEMNOTE_E2E=1`, so Playwright can summon the Draft window
 * without firing a real macOS-wide hotkey.
 */

export const E2eChannels = {
  TestShowDraft: '__test__:showDraft',
  TestHideDraft: '__test__:hideDraft',
} as const;

/** Shape of `window.__inmemnote_test__` (present only in E2E runs). */
export interface InmemnoteTestAPI {
  showDraft(): Promise<void>;
  hideDraft(): Promise<void>;
}
