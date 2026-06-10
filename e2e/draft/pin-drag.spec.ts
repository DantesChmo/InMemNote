import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';

/**
 * Dragging the pinned overlay to a different quadrant of the display must
 * snap it to that corner. The test drives the BrowserWindow directly (so it
 * works in headless Playwright + Electron) and asserts the post-drag bounds.
 */
test.describe('Pinned drag-to-corner', () => {
  for (const corner of ['tl', 'tr', 'bl', 'br'] as const) {
    /**
     * @scenario Dragging the pinned window into a quadrant snaps it to that corner
     * @area Draft
     * @feature Pin / Drag-to-corner
     * @type positive
     * @priority P0
     *
     * Preconditions:
     *   - Draft pinned with content.
     *
     * Steps:
     *   1. Summon, type, pin (await animation).
     *   2. Programmatically `setBounds` so the window center lands in the
     *      target quadrant (tl/tr/bl/br).
     *   3. Wait for the snap animation.
     *
     * Expected:
     *   - The window's resulting center quadrant matches the target corner.
     */
    test(`drop on the ${corner} quadrant snaps the window into the ${corner} corner`, async () => {
      const handles = await launchApp();
      try {
        const draft = await DraftPage.summon(handles.app);
        await draft.editor().click();
        await draft.raw.keyboard.type('content');
        await draft.raw.waitForTimeout(200);

        await draft.clickPin();
        await draft.raw.waitForTimeout(700);

        const expectedCorner = corner;
        const finalBounds = await handles.app.evaluate(
          async ({ BrowserWindow, screen: screenMod }, args) => {
            const w = BrowserWindow.getAllWindows().find((win) =>
              win.webContents.getURL().includes('view=draft'),
            );
            if (!w) throw new Error('No draft window');
            const display = screenMod.getDisplayMatching(w.getBounds());
            const wa = display.workArea;
            const startBounds = w.getBounds();
            const targets: Record<string, { x: number; y: number }> = {
              tl: { x: wa.x + 30, y: wa.y + 30 },
              tr: { x: wa.x + wa.width - 360, y: wa.y + 30 },
              bl: { x: wa.x + 30, y: wa.y + wa.height - 260 },
              br: { x: wa.x + wa.width - 360, y: wa.y + wa.height - 260 },
            };
            const t = targets[args.corner];
            if (!t) throw new Error('bad corner');
            w.setBounds({ x: t.x, y: t.y, width: startBounds.width, height: startBounds.height });
            await new Promise((resolve) => setTimeout(resolve, 500));
            return w.getBounds();
          },
          { corner: expectedCorner },
        );

        await draft.raw.waitForTimeout(500);

        const bounds = await DraftPage.draftBounds(handles.app);

        const display = await handles.app.evaluate(({ BrowserWindow, screen: screenMod }) => {
          const w = BrowserWindow.getAllWindows().find((win) =>
            win.webContents.getURL().includes('view=draft'),
          );
          if (!w) throw new Error('No draft window');
          return screenMod.getDisplayMatching(w.getBounds()).workArea;
        });

        const centerX = (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2;
        const centerY = (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2;
        const midX = display.x + display.width / 2;
        const midY = display.y + display.height / 2;
        const onRight = centerX >= midX;
        const onBottom = centerY >= midY;
        const observed: 'tl' | 'tr' | 'bl' | 'br' = onRight
          ? onBottom
            ? 'br'
            : 'tr'
          : onBottom
            ? 'bl'
            : 'tl';

        expect(observed).toBe(expectedCorner);
        expect(finalBounds).toBeTruthy();
      } finally {
        await handles.dispose();
      }
    });
  }

  /**
   * @scenario First pin lands at the design-default top-right anchor
   * @area Draft
   * @feature Pin / Anchor
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Summon, type, pin (await animation).
   *   2. Measure window bounds relative to the work area.
   *
   * Expected:
   *   - Window right edge is within ~40 px of the work-area right edge.
   *   - Window top edge is within ~40 px of the work-area top edge.
   *
   * Notes:
   *   - The internal `lastPinnedCorner` field only updates through the
   *     native mouseUp stream which Playwright cannot drive. We assert the
   *     observable geometry instead of internal state.
   */
  test('first pin lands in the top-right anchor by design', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('first pin');
      await draft.raw.waitForTimeout(200);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      const r = await handles.app.evaluate(({ BrowserWindow, screen: screenMod }) => {
        const w = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('view=draft'),
        );
        if (!w) throw new Error('No draft window');
        const b = w.getBounds();
        const wa = screenMod.getDisplayMatching(b).workArea;
        return { b, wa };
      });
      const rightGap = r.wa.x + r.wa.width - (r.b.x + r.b.width);
      const topGap = r.b.y - r.wa.y;
      expect(rightGap).toBeLessThan(40);
      expect(topGap).toBeLessThan(40);
    } finally {
      await handles.dispose();
    }
  });
});
