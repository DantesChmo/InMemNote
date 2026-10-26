import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';
import { expectTheme, loadSettings, restartApp, SettingsPopup } from '../helpers/settings';

/**
 * Settings → Палитра → theme switcher (system / dark / light).
 *
 * Commit model: the choice is a live preview on `<html data-theme>` while the
 * popup is open; it is only persisted by "Сохранить". The host's own
 * `prefers-color-scheme` is unknown, so tests always pick explicit modes and
 * derive "the opposite" from what the page shows before the change.
 */
test.describe('Settings: theme', () => {
  /**
   * @scenario Theme choice previews live and is rolled back by Esc
   * @area Settings
   * @feature Theme
   * @type positive
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData (theme mode = system).
   *
   * Steps:
   *   1. Note the current `data-theme` (dark or light, from the OS).
   *   2. Open Settings, pick the opposite explicit mode.
   *   3. Press Escape.
   *
   * Expected:
   *   - After step 2 `<html data-theme>` flips immediately, with nothing saved
   *     (persisted `themeMode` is still `system`).
   *   - After step 3 the original `data-theme` is restored.
   */
  test('theme previews live and Esc rolls it back to the persisted value', async () => {
    const handles = await launchApp();
    try {
      const page = handles.library;
      const original = await page.locator('html').getAttribute('data-theme');
      const other = original === 'dark' ? 'light' : 'dark';

      const settings = new SettingsPopup(page);
      await settings.open();
      await settings.chooseTheme(other);
      await expectTheme(page, other);
      expect((await loadSettings(page)).themeMode).toBe('system');

      await page.keyboard.press('Escape');
      await settings.expectClosed();
      await expectTheme(page, original as 'dark' | 'light');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Saved theme survives an app restart
   * @area Settings
   * @feature Theme
   * @type persistence
   * @priority P0
   *
   * Preconditions:
   *   - Fresh userData.
   *
   * Steps:
   *   1. Open Settings, pick "Светлая", click "Сохранить".
   *   2. Close the app and launch it again on the same userData.
   *   3. Open Settings, pick "Тёмная", click "Сохранить".
   *   4. Restart once more.
   *
   * Expected:
   *   - After step 1: popup closed, `data-theme="light"`.
   *   - After step 2: `data-theme="light"` without opening Settings.
   *   - After step 4: `data-theme="dark"` (so the value is read from the DB,
   *     not from a stale default).
   */
  test('saved theme is applied again after restart', async () => {
    let handles = await launchApp();
    try {
      const settings = new SettingsPopup(handles.library);
      await settings.open();
      await settings.chooseTheme('light');
      await settings.save();
      await expectTheme(handles.library, 'light');

      handles = await restartApp(handles);
      await expectTheme(handles.library, 'light');

      const afterRestart = new SettingsPopup(handles.library);
      await afterRestart.open();
      await afterRestart.chooseTheme('dark');
      await afterRestart.save();
      await expectTheme(handles.library, 'dark');

      handles = await restartApp(handles);
      await expectTheme(handles.library, 'dark');
      expect((await loadSettings(handles.library)).themeMode).toBe('dark');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario A saved theme reaches an already-open Draft window (settings:changed broadcast)
   * @area Settings
   * @feature Theme
   * @type positive
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData; the Draft window has been summoned.
   *
   * Steps:
   *   1. In Library, open Settings, pick "Тёмная", save.
   *   2. In Library, open Settings, pick "Светлая", save.
   *
   * Expected:
   *   - The Draft window's `data-theme` follows each save (dark, then light),
   *     without any action in the Draft window.
   */
  test('saved theme is broadcast to an open Draft window', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      const settings = new SettingsPopup(handles.library);

      await settings.open();
      await settings.chooseTheme('dark');
      await settings.save();
      await expectTheme(draft.raw, 'dark');

      await settings.open();
      await settings.chooseTheme('light');
      await settings.save();
      await expectTheme(draft.raw, 'light');
    } finally {
      await handles.dispose();
    }
  });
});
