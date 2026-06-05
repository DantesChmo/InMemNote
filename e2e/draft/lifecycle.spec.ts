import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';

test.describe('Draft lifecycle', () => {
  test('summon shows the overlay and the editor becomes editable', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await expect(draft.editor()).toBeVisible();
      await expect(draft.raw.getByText('Быстрая заметка')).toBeVisible();
    } finally {
      await handles.dispose();
    }
  });

  test('Esc hides the overlay without promoting; reopening restores the buffer', async () => {
    const handles = await launchApp();
    try {
      // First summon: type and Esc.
      let draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('half-written thought');
      await handles.app.evaluate(() => undefined); // flush a tick
      await draft.raw.waitForTimeout(600); // past autosave debounce
      await draft.cancel();
      await DraftPage.hide(handles.app);

      // Library should NOT have a new note — Esc never promotes.
      await expect(handles.library.locator('[data-testid^="note-card-"]')).toHaveCount(0);

      // Re-summon: the buffer rehydrates because the draft was non-empty.
      draft = await DraftPage.summon(handles.app);
      await expect(draft.editor()).toContainText('half-written thought');
    } finally {
      await handles.dispose();
    }
  });

  test('typing triggers an autosave (visible by reopening after a refresh-cycle)', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('autosave probe');
      await draft.raw.waitForTimeout(800); // > debounce
      await DraftPage.hide(handles.app);

      const draft2 = await DraftPage.summon(handles.app);
      await expect(draft2.editor()).toContainText('autosave probe');
    } finally {
      await handles.dispose();
    }
  });

  test('losing focus hides an unpinned overlay (Spotlight-style behavior)', async () => {
    const handles = await launchApp();
    try {
      await DraftPage.summon(handles.app);

      // We can't reliably drive the OS focus stack from Playwright (CDP and
      // BrowserWindow.focus() both fail to deliver a `blur` to the right
      // window in a headless test env). Instead, we exercise the contract
      // directly: ensure that the Draft BrowserWindow is currently registered
      // for a `blur` handler AND that, when the event fires, the window is
      // gone afterwards. That's precisely the behavior the user complained
      // about, and it is exactly what main's `w.on('blur', …)` implements.
      const result = await handles.app.evaluate(async ({ BrowserWindow }) => {
        const draft = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes('view=draft'),
        );
        if (!draft) return { listeners: 0, visibleAfter: null as boolean | null };
        const listeners = draft.listenerCount('blur');
        // Make sure it's actually shown before we test the hide.
        draft.show();
        // Fire blur synchronously: Electron forwards it to all listeners.
        draft.emit('blur');
        // Give the listener a tick to run (it calls `hide()`).
        await new Promise((r) => setTimeout(r, 50));
        return { listeners, visibleAfter: draft.isVisible() };
      });
      expect(result.listeners).toBeGreaterThan(0);
      expect(result.visibleAfter).toBe(false);
    } finally {
      await handles.dispose();
    }
  });

  test('pin keeps the overlay always-on-top: blur should NOT hide it', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('pinned thought');
      await draft.raw.waitForTimeout(800);

      await draft.clickPin();

      // Focus the Library window: the pinned Draft must stay visible.
      await handles.library.bringToFront();
      await draft.raw.waitForTimeout(300);
      const stillThere = await draft.isVisible();
      expect(stillThere).toBe(true);
    } finally {
      await handles.dispose();
    }
  });
});
