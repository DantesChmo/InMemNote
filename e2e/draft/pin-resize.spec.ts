import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';

/**
 * Pinning the Draft overlay shrinks the BrowserWindow itself (320 px wide
 * pinned, 560 px wide un-pinned). Beyond the basic toggle we also check:
 *
 *   - pin → unpin restores the original width;
 *   - alternating toggles never let the width drift;
 *   - the pinned window has alwaysOnTop set, the unpinned one does not.
 */
test.describe('Pinned BrowserWindow resize', () => {
  /**
   * @scenario Pin/unpin shrinks/restores the BrowserWindow width between 560 and 320 px
   * @area Draft
   * @feature Pin / Window geometry
   * @type positive
   * @priority P0
   *
   * Steps:
   *   1. Summon, type, measure baseline width.
   *   2. Click pin (await animation), measure width.
   *   3. Click pin again to unpin (await animation), measure width.
   *
   * Expected:
   *   - Baseline width = 560.
   *   - Pinned width = 320.
   *   - Unpinned width = 560 again.
   */
  test('pin/unpin resizes the BrowserWindow between 560 and 320', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('content');
      await draft.raw.waitForTimeout(200);

      const beforePin = await DraftPage.draftBounds(handles.app);
      expect(beforePin?.width).toBe(560);

      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      const afterPin = await DraftPage.draftBounds(handles.app);
      expect(afterPin?.width).toBe(320);

      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      const afterUnpin = await DraftPage.draftBounds(handles.app);
      expect(afterUnpin?.width).toBe(560);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario `alwaysOnTop` flag flips with pin state
   * @area Draft
   * @feature Pin / AlwaysOnTop
   * @type positive
   * @priority P0
   *
   * Steps:
   *   1. Summon → check `isAlwaysOnTop()` is false.
   *   2. Click pin (await animation) → check `isAlwaysOnTop()` is true.
   *   3. Click pin again (await animation) → check false again.
   *
   * Expected:
   *   - `isAlwaysOnTop()` matches the current pinned state at each step.
   */
  test('alwaysOnTop flips with pin state', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('top');
      await draft.raw.waitForTimeout(200);

      const beforePin = await handles.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('view=draft'),
        );
        return w?.isAlwaysOnTop();
      });
      expect(beforePin).toBe(false);

      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      const afterPin = await handles.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('view=draft'),
        );
        return w?.isAlwaysOnTop();
      });
      expect(afterPin).toBe(true);

      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      const afterUnpin = await handles.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('view=draft'),
        );
        return w?.isAlwaysOnTop();
      });
      expect(afterUnpin).toBe(false);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Many pin/unpin toggles do not let the window width drift
   * @area Draft
   * @feature Pin / Window geometry
   * @type race
   * @priority P1
   *
   * Steps:
   *   1. Summon, type, await autosave.
   *   2. Toggle pin off/on/off… 3 full cycles (6 clicks).
   *   3. Pin once more.
   *
   * Expected:
   *   - After even toggles: width = 560 px (unpinned default).
   *   - After the extra pin: width = 320 px.
   */
  test('width does not drift after many toggles (state-machine stability)', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('drift test');
      await draft.raw.waitForTimeout(200);

      for (let i = 0; i < 3; i++) {
        await draft.clickPin(); // pin
        await draft.raw.waitForTimeout(700);
        await draft.clickPin(); // unpin
        await draft.raw.waitForTimeout(700);
      }
      const final = await DraftPage.draftBounds(handles.app);
      expect(final?.width).toBe(560);

      await draft.clickPin();
      await draft.raw.waitForTimeout(700);
      const pinned = await DraftPage.draftBounds(handles.app);
      expect(pinned?.width).toBe(320);
    } finally {
      await handles.dispose();
    }
  });
});
