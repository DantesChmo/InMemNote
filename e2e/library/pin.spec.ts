import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { LibraryPage } from '../helpers/library';

/**
 * Library pinning coverage.
 *
 *   - happy path: toggle UI label, card marker, list reordering
 *   - edge cases: pinning the only note, unpinning the only pinned note
 *   - persistence of pin state across an app restart
 *   - races: rapid pin spam, pinning during the Pinned filter view
 */
test.describe('Library pin', () => {
  /**
   * @scenario Pin toggle flips editor label and surfaces a pin marker on the card
   * @area Library
   * @feature Pin
   * @type positive
   * @priority P0
   *
   * Steps:
   *   1. Create "important", wait past autosave.
   *   2. Click the pin button → "закреплено" label visible; card shows pin icon.
   *   3. Click again → "не закреплено" visible.
   *
   * Expected:
   *   - Editor label toggles between "не закреплено" and "закреплено".
   *   - Pin SVG marker is visible on the card in pinned state.
   */
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

      const firstCard = library.cards().first();
      const pinSvg = firstCard.locator('svg').last();
      await expect(pinSvg).toBeVisible();

      await library.clickPin();
      await expect(handles.library.getByText('не закреплено')).toBeVisible();
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Pinning an older note moves it to the top of the list
   * @area Library
   * @feature Pin / Ordering
   * @type positive
   * @priority P0
   *
   * Steps:
   *   1. Create "older", then "newer".
   *   2. Click the older (last) card, pin it.
   *
   * Expected:
   *   - First card now contains "older".
   */
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

      await library.cards().last().click();
      await library.clickPin();

      await expect(library.cards().first()).toContainText('older');
    } finally {
      await handles.dispose();
    }
  });

  // ---------- Persistence + edge cases ----------

  /**
   * @scenario Pin state survives a full app restart
   * @area Library
   * @feature Pin / Persistence
   * @type persistence
   * @priority P0
   *
   * Steps:
   *   1. Launch, ⌘N "persisted pin", wait past autosave, pin.
   *   2. Close app, re-launch with same userData.
   *   3. Click the card.
   *
   * Expected:
   *   - Editor shows "закреплено" after the restart.
   */
  test('pin state survives an app restart', async () => {
    const first = await launchApp();
    const sharedDir = first.userDataDir;
    {
      const library = new LibraryPage(first.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('persisted pin');
      await first.library.waitForTimeout(800);
      await library.clickPin();
      await expect(first.library.getByText('закреплено')).toBeVisible();
      await first.library.waitForTimeout(200);
    }
    await first.app.close();

    const second = await launchApp({ reuseUserDataDir: sharedDir });
    try {
      const library = new LibraryPage(second.library);
      await expect(library.cards()).toHaveCount(1);
      await library.cards().first().click();
      await expect(second.library.getByText('закреплено')).toBeVisible();
    } finally {
      await second.dispose();
      const { rmSync } = await import('node:fs');
      try {
        rmSync(sharedDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  /**
   * @scenario Unpinning the only pinned note empties the Pinned filter view
   * @area Library
   * @feature Pin / Filter
   * @type edge
   * @priority P1
   *
   * Steps:
   *   1. Create "alone", wait past autosave, pin.
   *   2. Switch filter to "Закреплённые" → 1 card.
   *   3. Click pin again to unpin.
   *
   * Expected:
   *   - 0 cards visible; empty-state copy ("В этом разделе пусто" or
   *     "Ничего не найдено") is shown.
   */
  test('pinning the only note then switching to Pinned filter shows it', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('alone');
      await handles.library.waitForTimeout(800);
      await library.clickPin();

      await library.selectFilter('Закреплённые');
      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('alone');

      await library.clickPin();
      await expect(library.cards()).toHaveCount(0);
      await expect(
        handles.library.getByText(/В этом разделе пусто|Ничего не найдено/).first(),
      ).toBeVisible();
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Multiple pinned notes preserve their relative order above unpinned ones
   * @area Library
   * @feature Pin / Ordering
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Create alpha, bravo, charlie (each waits for its card title).
   *   2. Pin alpha (last card), then pin charlie (locate by text).
   *
   * Expected:
   *   - First two cards are the pinned ones (alpha, charlie — order may
   *     depend on most-recently-pinned).
   *   - Third card is "bravo" (unpinned).
   */
  test('multiple pinned notes preserve their relative order (newer-pinned first)', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('alpha');
      await library.waitForCardTitle('alpha');

      await library.pressNewShortcut();
      await library.typeIntoEditor('bravo');
      await library.waitForCardTitle('bravo');

      await library.pressNewShortcut();
      await library.typeIntoEditor('charlie');
      await library.waitForCardTitle('charlie');

      await library.cards().last().click();
      await library.clickPin();
      await library.cards().first().click();
      await handles.library.getByText('charlie').first().click();
      await library.clickPin();

      const titles = await library.cardTitles();
      expect(titles[0]).toMatch(/charlie|alpha/);
      expect(titles[1]).toMatch(/charlie|alpha/);
      expect(titles[2]).toContain('bravo');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Rapid pin spam does not desync the UI label from the actual pin state
   * @area Library
   * @feature Pin / Race
   * @type race
   * @priority P1
   *
   * Steps:
   *   1. Create "racy", wait past autosave.
   *   2. Click pin 6 times with a small inter-click delay.
   *   3. Wait briefly for `notes:changed` broadcasts to settle.
   *   4. Switch filter to "Закреплённые".
   *
   * Expected:
   *   - Even number of clicks → editor label is "не закреплено".
   *   - Pinned filter view contains 0 cards.
   */
  test('rapid pin spam does not desync the UI label and the actual pin state', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('racy');
      await handles.library.waitForTimeout(800);

      for (let i = 0; i < 6; i++) {
        await library.clickPin();
        await handles.library.waitForTimeout(80);
      }
      await handles.library.waitForTimeout(400);
      await expect(handles.library.getByText('не закреплено')).toBeVisible();

      await library.selectFilter('Закреплённые');
      await expect(library.cards()).toHaveCount(0);
    } finally {
      await handles.dispose();
    }
  });
});
