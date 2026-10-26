import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';
import { restartApp } from '../helpers/library';

/**
 * Draft autosave flush on quit (bug #02).
 *
 * The Draft overlay debounces saves by 500 ms and, unlike a Library edit, the
 * user typically hits ⌘Q (or the auto-updater relaunches the app) right after
 * the last keystroke. The pending edit must still reach SQLite through the
 * renderer's `beforeunload` hook, and be what the next summon shows.
 */
test.describe('Draft quit flush', () => {
  /**
   * @scenario Typing into Draft then quitting within 500 ms keeps the full text
   * @area Cross-window
   * @feature Draft autosave / Quit (bug #02)
   * @type persistence
   * @priority P0
   *
   * Steps:
   *   1. Summon Draft and type "last words before quit" without waiting for
   *      the autosave debounce.
   *   2. Quit the app immediately (inside the 500 ms window).
   *   3. Relaunch on the same userData and summon Draft.
   *
   * Expected:
   *   - The summoned Draft contains the whole text, including the final
   *     characters typed just before the quit.
   */
  test('typing into Draft and quitting inside 500 ms does not drop the tail', async () => {
    const first = await launchApp();
    let second: Awaited<ReturnType<typeof restartApp>> | undefined;
    try {
      const draft = await DraftPage.summon(first.app);
      await expect(draft.editor()).toBeVisible();
      await draft.typeIntoEditor('last words before quit');

      // No wait: quitting inside the debounce window is the scenario.
      second = await restartApp(first);

      const summoned = await DraftPage.summon(second.app);
      await expect(summoned.editor()).toContainText('last words before quit');
    } finally {
      await (second ?? first).dispose();
    }
  });
});
