import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';

/**
 * Manual pin resize feature:
 *   - user can grow the pinned panel via the diagonal-opposite corner handle
 *   - bounds are clamped to ~45 % of the work area per axis
 *   - reset button restores the design-default pin width
 *   - the pinned corner (anchor) stays put through the resize
 *
 * The renderer's ResizeHandle ships width/height to main via IPC. Tests
 * exercise the IPC path directly via `app.evaluate` — that's the most
 * faithful simulation of a real drag because Playwright Electron doesn't
 * dispatch screen-relative mouse events through the AppKit pipeline.
 */
test.describe('Pinned manual resize', () => {
  test('setPinSize grows the window from the anchor and clamps to 45% of work area', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('content');
      await draft.raw.waitForTimeout(200);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      // Ask main directly: bounds before resize and the anchor corner.
      const before = await handles.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('view=draft'),
        );
        return w?.getBounds();
      });
      expect(before?.width).toBe(320);
      // The anchor must be the top-right corner (default first pin).
      const anchorTopRightX = (before?.x ?? 0) + (before?.width ?? 0);
      const anchorTopRightY = before?.y ?? 0;

      // Grow well past the cap to verify clamping.
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

      // Cap is 45 % of work area on each axis.
      const maxW = Math.round(after.workArea.width * 0.45);
      const maxH = Math.round(after.workArea.height * 0.45);
      expect(after.bounds.width).toBeLessThanOrEqual(maxW + 1);
      expect(after.bounds.height).toBeLessThanOrEqual(maxH + 1);
      expect(after.bounds.width).toBeGreaterThan(320); // we actually grew

      // Top-right corner is the anchor — must NOT have moved.
      const newTopRightX = after.bounds.x + after.bounds.width;
      expect(newTopRightX).toBe(anchorTopRightX);
      expect(after.bounds.y).toBe(anchorTopRightY);
    } finally {
      await handles.dispose();
    }
  });

  test('resetPinSize restores the default pin width with animation', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('content');
      await draft.raw.waitForTimeout(200);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      // Grow first.
      await draft.raw.evaluate(async () => {
        await window.inmemnote.draft.setPinSize({ width: 500, height: 400 });
      });
      await draft.raw.waitForTimeout(200);

      const grown = await handles.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('view=draft'),
        );
        return w?.getBounds().width;
      });
      expect(grown).toBeGreaterThan(320);

      // Reset.
      await draft.raw.evaluate(async () => {
        await window.inmemnote.draft.resetPinSize();
      });
      // Wait through the snap animation (max 400 ms fallback).
      await draft.raw.waitForTimeout(700);

      const reset = await handles.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('view=draft'),
        );
        return w?.getBounds().width;
      });
      expect(reset).toBe(320);
    } finally {
      await handles.dispose();
    }
  });

  test('getCorner reports the current pin anchor', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('content');
      await draft.raw.waitForTimeout(200);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      // Default anchor on first pin is top-right.
      const corner = await draft.raw.evaluate(() => window.inmemnote.draft.getCorner());
      expect(corner).toBe('tr');
    } finally {
      await handles.dispose();
    }
  });
});
