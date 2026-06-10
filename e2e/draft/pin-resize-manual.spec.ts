import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';

/**
 * Manual pin resize feature:
 *   - user can grow the pinned panel via the diagonal-opposite corner handle
 *   - bounds are clamped to ~45 % of the work area per axis
 *   - reset button restores the design-default pin width
 *   - the pinned corner (anchor) stays put through the resize
 *   - shrinking below the minimum is clamped UP
 *   - setPinSize is a no-op while unpinned
 */
test.describe('Pinned manual resize', () => {
  /**
   * @scenario `setPinSize` grows the pinned window from its anchor and clamps to ~45 % of the work area
   * @area Draft
   * @feature Pin / Manual resize
   * @type positive
   * @priority P0
   *
   * Steps:
   *   1. Summon, type, pin (await animation).
   *   2. Record baseline bounds + top-right anchor coordinates.
   *   3. Call `setPinSize({ width: 9999, height: 9999 })`.
   *
   * Expected:
   *   - Resulting width ≤ round(workArea.width * 0.45) + 1.
   *   - Resulting height ≤ round(workArea.height * 0.45) + 1.
   *   - Width is strictly larger than 320 (the resize actually grew).
   *   - Top-right anchor X and Y are unchanged.
   */
  test('setPinSize grows the window from the anchor and clamps to 45% of work area', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('content');
      await draft.raw.waitForTimeout(200);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      const before = await DraftPage.draftBounds(handles.app);
      expect(before?.width).toBe(320);
      const anchorTopRightX = (before?.x ?? 0) + (before?.width ?? 0);
      const anchorTopRightY = before?.y ?? 0;

      await draft.raw.evaluate(async () => {
        await window.inmemnote.draft.setPinSize({ width: 9999, height: 9999 });
      });
      await draft.raw.waitForTimeout(200);

      const after = await handles.app.evaluate(({ BrowserWindow, screen: s }) => {
        const w = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('view=draft'),
        );
        if (!w) throw new Error('no draft window');
        const b = w.getBounds();
        const wa = s.getDisplayMatching(b).workArea;
        return { bounds: b, workArea: wa };
      });

      const maxW = Math.round(after.workArea.width * 0.45);
      const maxH = Math.round(after.workArea.height * 0.45);
      expect(after.bounds.width).toBeLessThanOrEqual(maxW + 1);
      expect(after.bounds.height).toBeLessThanOrEqual(maxH + 1);
      expect(after.bounds.width).toBeGreaterThan(320);

      const newTopRightX = after.bounds.x + after.bounds.width;
      expect(newTopRightX).toBe(anchorTopRightX);
      expect(after.bounds.y).toBe(anchorTopRightY);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario `resetPinSize` animates back to the design-default pin width
   * @area Draft
   * @feature Pin / Manual resize
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Summon, pin, grow via `setPinSize({500, 400})`.
   *   2. Call `resetPinSize()`.
   *   3. Wait through the snap animation.
   *
   * Expected:
   *   - After grow: width > 320.
   *   - After reset: width = 320.
   */
  test('resetPinSize restores the default pin width with animation', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('content');
      await draft.raw.waitForTimeout(200);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      await draft.raw.evaluate(async () => {
        await window.inmemnote.draft.setPinSize({ width: 500, height: 400 });
      });
      await draft.raw.waitForTimeout(200);

      const grown = await DraftPage.draftBounds(handles.app);
      expect((grown?.width ?? 0)).toBeGreaterThan(320);

      await draft.raw.evaluate(async () => {
        await window.inmemnote.draft.resetPinSize();
      });
      await draft.raw.waitForTimeout(700);

      const reset = await DraftPage.draftBounds(handles.app);
      expect(reset?.width).toBe(320);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario `getCorner()` returns the current pin anchor ('tr' by default)
   * @area Draft
   * @feature Pin / Anchor
   * @type positive
   * @priority P2
   *
   * Steps:
   *   1. Summon, pin (await animation).
   *   2. Call `getCorner()`.
   *
   * Expected:
   *   - Returned value is `'tr'`.
   */
  test('getCorner reports the current pin anchor', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('content');
      await draft.raw.waitForTimeout(200);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      const corner = await draft.raw.evaluate(() => window.inmemnote.draft.getCorner());
      expect(corner).toBe('tr');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario `setPinSize` is a no-op when the overlay is UNPINNED
   * @area Draft
   * @feature Pin / Manual resize
   * @type negative
   * @priority P1
   *
   * Steps:
   *   1. Summon (do NOT pin), record baseline width.
   *   2. Call `setPinSize({400, 400})`.
   *
   * Expected:
   *   - Width does not change.
   */
  test('setPinSize is a no-op while the overlay is UNPINNED', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('not pinned');
      await draft.raw.waitForTimeout(200);

      const before = await DraftPage.draftBounds(handles.app);
      expect(before?.width).toBe(560);

      await draft.raw.evaluate(async () => {
        await window.inmemnote.draft.setPinSize({ width: 400, height: 400 });
      });
      await draft.raw.waitForTimeout(300);

      const after = await DraftPage.draftBounds(handles.app);
      expect(after?.width).toBe(before?.width);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Shrink below minimum is clamped to a sane floor
   * @area Draft
   * @feature Pin / Manual resize
   * @type edge
   * @priority P1
   *
   * Steps:
   *   1. Summon, pin (await animation).
   *   2. Call `setPinSize({10, 10})` (well below the floor).
   *
   * Expected:
   *   - Width ≥ 200, height ≥ 80 (generous lower bounds — exact floor is
   *     defined in `clampPinSize`).
   */
  test('shrinking below the minimum is clamped to the minimum (not negative)', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('content');
      await draft.raw.waitForTimeout(200);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      await draft.raw.evaluate(async () => {
        await window.inmemnote.draft.setPinSize({ width: 10, height: 10 });
      });
      await draft.raw.waitForTimeout(300);

      const after = await DraftPage.draftBounds(handles.app);
      expect(after?.width).toBeGreaterThanOrEqual(200);
      expect(after?.height).toBeGreaterThanOrEqual(80);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Chained `setPinSize` calls do not let the anchor drift
   * @area Draft
   * @feature Pin / Manual resize
   * @type race
   * @priority P1
   *
   * Steps:
   *   1. Summon, pin (await animation), record anchor (top-right) X, Y.
   *   2. Call `setPinSize` four times with increasing widths (360→480).
   *
   * Expected:
   *   - The top-right X (anchor) is unchanged across the chain.
   *   - The Y of the top-right anchor is unchanged.
   */
  test('multiple grows compose without anchor drift', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('chain');
      await draft.raw.waitForTimeout(200);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      const start = await DraftPage.draftBounds(handles.app);
      const anchorRightX = (start?.x ?? 0) + (start?.width ?? 0);
      const anchorTopY = start?.y ?? 0;

      for (const w of [360, 400, 440, 480]) {
        await draft.raw.evaluate(async (width) => {
          await window.inmemnote.draft.setPinSize({ width, height: 300 });
        }, w);
        await draft.raw.waitForTimeout(150);
      }

      const end = await DraftPage.draftBounds(handles.app);
      const newAnchorRightX = (end?.x ?? 0) + (end?.width ?? 0);
      expect(newAnchorRightX).toBe(anchorRightX);
      expect(end?.y).toBe(anchorTopY);
    } finally {
      await handles.dispose();
    }
  });
});
