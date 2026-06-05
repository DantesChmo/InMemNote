import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { LibraryPage } from '../helpers/library';

test.describe('Library pin', () => {
  test('pin toggles editor state and surfaces a pin marker on the card', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('important');
      await handles.library.waitForTimeout(800);

      await expect(handles.library.getByText('не закреплено')).toBeVisible();
      await library.clickPin();
      await expect(handles.library.getByText('закреплено')).toBeVisible();

      // The pin button gets a `data-testid` reused across pin states; we
      // assert via the marker inside the card.
      const firstCard = library.cards().first();
      const pinSvg = firstCard.locator('svg').last();
      await expect(pinSvg).toBeVisible();

      // Unpin returns the state.
      await library.clickPin();
      await expect(handles.library.getByText('не закреплено')).toBeVisible();
    } finally {
      await handles.dispose();
    }
  });

  test('pinned notes rise to the top of the list', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('older');
      await handles.library.waitForTimeout(800);

      await library.pressNewShortcut();
      await library.typeIntoEditor('newer');
      await handles.library.waitForTimeout(800);

      // Pin the older note (last in the list) — it should jump to the top.
      await library.cards().last().click();
      await library.clickPin();

      await expect(library.cards().first()).toContainText('older');
    } finally {
      await handles.dispose();
    }
  });
});
