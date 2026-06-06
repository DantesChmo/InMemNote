import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';

/**
 * Pinning the Draft overlay must shrink the BrowserWindow itself, not just
 * the panel inside it. Before this fix the renderer flipped to the compact
 * 320px layout while the underlying window stayed at 560px, leaving an empty
 * gutter around the panel.
 */
test('pin/unpin resizes the BrowserWindow between 560 and 320', async () => {
  const handles = await launchApp();
  try {
    const draft = await DraftPage.summon(handles.app);
    await draft.typeIntoEditor('content');
    await draft.raw.waitForTimeout(200);

    const beforePin = await handles.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('view=draft'),
      );
      return w?.getBounds();
    });
    expect(beforePin?.width).toBe(560);

    await draft.clickPin();
    await draft.raw.waitForTimeout(700); // FLIP + bounds update

    const afterPin = await handles.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('view=draft'),
      );
      return w?.getBounds();
    });
    expect(afterPin?.width).toBe(320);

    await draft.clickPin();
    await draft.raw.waitForTimeout(700);

    const afterUnpin = await handles.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('view=draft'),
      );
      return w?.getBounds();
    });
    expect(afterUnpin?.width).toBe(560);
  } finally {
    await handles.dispose();
  }
});
