import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { LibraryPage, restartApp } from '../helpers/library';

/**
 * Sidebar badges ("Все заметки" / "Закреплённые", docs/TZ.md §4a.2).
 *
 * The numbers are what the user glances at to know how much is in the
 * Library, so they must follow every create / pin / delete without a reload.
 */

test.describe('Library sidebar counts', () => {
  /**
   * @scenario Sidebar counts follow create, pin, unpin and delete
   * @area Library
   * @feature Sidebar / Counts
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Fresh userData: read both badges.
   *   2. ⌘N twice (two notes), pin the selected one, unpin it, pin it again.
   *   3. Delete the pinned note (soft delete), then click "Отменить".
   *   4. Delete the pinned note again and dismiss the toast with "×".
   *
   * Expected:
   *   - Start: "Все заметки" 0, "Закреплённые" 0.
   *   - After two creates: 2 / 0. After pinning: 2 / 1. After unpin: 2 / 0.
   *   - Delete of a pinned note: 1 / 0 at once (the card is hidden at once);
   *     Undo brings back 2 / 1.
   *   - After the second delete is committed the counts stay 1 / 0.
   */
  test('counts react to create, pin, unpin, delete and undo', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      const all = library.sidebarCount('Все заметки');
      const pinned = library.sidebarCount('Закреплённые');

      await expect(all).toHaveText('0');
      await expect(pinned).toHaveText('0');

      await library.pressNewShortcut();
      await expect(all).toHaveText('1');
      await library.pressNewShortcut();
      await expect(all).toHaveText('2');
      await expect(pinned).toHaveText('0');

      await library.clickPin();
      await expect(pinned).toHaveText('1');
      await library.clickPin();
      await expect(pinned).toHaveText('0');
      await library.clickPin();
      await expect(pinned).toHaveText('1');
      await expect(all).toHaveText('2');

      await library.clickDelete();
      await expect(all).toHaveText('1');
      await expect(pinned).toHaveText('0');

      await library.clickUndo();
      await expect(all).toHaveText('2');
      await expect(pinned).toHaveText('1');

      await library.clickDelete();
      await expect(library.undoToast()).toBeVisible();
      // Commit via "×" rather than sleeping out the 6 s toast.
      await library.clickDismissToast();
      await expect(library.undoToast()).toBeHidden();
      await expect(all).toHaveText('1');
      await expect(pinned).toHaveText('0');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Counts are the same after a restart as before it
   * @area Library
   * @feature Sidebar / Counts
   * @type persistence
   * @priority P2
   *
   * Steps:
   *   1. Create three notes, pin one, wait until main has stored them.
   *   2. Quit and relaunch on the same userData.
   *
   * Expected:
   *   - "Все заметки" 3 and "Закреплённые" 1 right after the relaunch.
   */
  test('counts are restored after a restart', async () => {
    const first = await launchApp();
    let second: Awaited<ReturnType<typeof restartApp>> | undefined;
    try {
      const library = new LibraryPage(first.library);
      for (const text of ['one', 'two', 'three']) {
        await library.pressNewShortcut();
        await library.typeIntoEditor(text);
        await expect
          .poll(async () => (await library.storedNotes()).some((n) => n.content === text))
          .toBe(true);
      }
      await library.clickPin();
      await expect
        .poll(async () => (await library.storedNotes()).filter((n) => n.pinned).length)
        .toBe(1);

      second = await restartApp(first);
      const relaunched = new LibraryPage(second.library);
      await expect(relaunched.sidebarCount('Все заметки')).toHaveText('3');
      await expect(relaunched.sidebarCount('Закреплённые')).toHaveText('1');
    } finally {
      await (second ?? first).dispose();
    }
  });

  /**
   * @scenario Sidebar totals do not change when a filter or a search narrows the list
   * @area Library
   * @feature Sidebar / Counts
   * @type negative
   * @priority P2
   *
   * Steps:
   *   1. Create two notes and pin one ("Все заметки" 2, "Закреплённые" 1).
   *   2. Click "Закреплённые", then search for a string that matches nothing.
   *
   * Expected:
   *   - Both badges keep showing the Library totals (2 and 1): they label
   *     sections of the whole Library, not the current result list.
   *
   * Notes:
   *   - test.fixme: the badges are derived from the filtered `notes` cache
   *     (`LibrarySidebar` counts `s.library.notes`), so "Все заметки" drops
   *     to 1 under the Pinned filter and both drop to 0 during a search.
   */
  test('totals stay put under the Pinned filter and a search', async () => {
    test.fixme(true, 'sidebar badges count the filtered list, not the whole Library');
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.pressNewShortcut();
      await library.clickPin();
      await expect(library.sidebarCount('Все заметки')).toHaveText('2');

      await library.selectFilter('Закреплённые');
      await expect(library.cards()).toHaveCount(1);
      await expect(library.sidebarCount('Все заметки')).toHaveText('2');
      await expect(library.sidebarCount('Закреплённые')).toHaveText('1');

      await library.typeSearch('no-such-text');
      await expect(library.cards()).toHaveCount(0);
      await expect(library.sidebarCount('Все заметки')).toHaveText('2');
      await expect(library.sidebarCount('Закреплённые')).toHaveText('1');
    } finally {
      await handles.dispose();
    }
  });
});
