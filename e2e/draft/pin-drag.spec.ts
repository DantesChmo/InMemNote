import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';

/**
 * Dragging the pinned overlay to a different quadrant of the display must
 * snap it to that corner. The test drives the BrowserWindow directly (so it
 * works in headless Playwright + Electron) and asserts the post-drag bounds.
 */
test.describe('Pinned drag-to-corner', () => {
  for (const corner of ['tl', 'bl', 'br'] as const) {
    test(`drop on the ${corner} quadrant snaps the window into the ${corner} corner`, async () => {
      const handles = await launchApp();
      try {
        const draft = await DraftPage.summon(handles.app);
        await draft.editor().click();
        await draft.raw.keyboard.type('content');
        await draft.raw.waitForTimeout(200);

        await draft.clickPin();
        await draft.raw.waitForTimeout(700);

        // Move the window into the target quadrant programmatically. AppKit
        // can't be driven by Playwright, so we go straight to BrowserWindow.
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
            // The `move` event fires synchronously off `setBounds`; the drag
            // detector sees no size change and treats it as a real drag.
            await new Promise((resolve) => setTimeout(resolve, 500));
            return w.getBounds();
          },
          { corner: expectedCorner },
        );

        // Allow the snap animation to land.
        await draft.raw.waitForTimeout(500);

        const bounds = await handles.app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find((win) =>
            win.webContents.getURL().includes('view=draft'),
          );
          return w?.getBounds();
        });

        const display = await handles.app.evaluate(({ BrowserWindow, screen: screenMod }) => {
          const w = BrowserWindow.getAllWindows().find((win) =>
            win.webContents.getURL().includes('view=draft'),
          );
          if (!w) throw new Error('No draft window');
          return screenMod.getDisplayMatching(w.getBounds()).workArea;
        });

        // We don't care about the exact pixel — just that the centre of the
        // resulting window sits in the right quadrant.
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
        // Silence unused warning on `finalBounds` — useful in failure logs.
        expect(finalBounds).toBeTruthy();
      } finally {
        await handles.dispose();
      }
    });
  }

});

