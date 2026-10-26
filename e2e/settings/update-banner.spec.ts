import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { broadcastUpdateAvailable, SettingsPopup, type FakeRelease } from '../helpers/settings';

/**
 * Update banner (Library window).
 *
 * Auto-check and the real release gateway are disabled under
 * `INMEMNOTE_E2E=1`, so the banner is driven by broadcasting
 * `update:available` from the main process — the same message
 * `registerUpdateIpc.checkNow()` sends when a newer release is found.
 *
 * "Обновить и перезапустить" is NEVER clicked here: it downloads a DMG and
 * quits the app. Install is covered by unit tests only (`docs/TZ.md` §4d).
 */
const RELEASE: FakeRelease = {
  version: '99.1.0',
  downloadUrl: 'https://example.invalid/Inmemnote-99.1.0.dmg',
  notesUrl: 'https://example.invalid/releases/v99.1.0',
};

test.describe('Update banner', () => {
  /**
   * @scenario A broadcast release shows the banner with its version; "Позже" hides it
   * @area Settings
   * @feature Update banner
   * @type positive
   * @priority P2
   *
   * Preconditions:
   *   - Fresh userData; update check is disabled under E2E, so no banner at start.
   *
   * Steps:
   *   1. Verify the banner is absent.
   *   2. From main, send `update:available` { version: "99.1.0", … } to the Library webContents.
   *   3. Click "Позже".
   *
   * Expected:
   *   - After step 2 a status region announces "Доступна версия 99.1.0" and offers
   *     "Что нового" (linking to the release notes), "Позже" and "Обновить и перезапустить".
   *   - After step 3 the banner disappears.
   */
  test('banner shows the announced version and "Later" dismisses it', async () => {
    const handles = await launchApp();
    try {
      const banner = handles.library.getByRole('status', { name: 'Update available' });
      await expect(banner).toHaveCount(0);

      await broadcastUpdateAvailable(handles.app, RELEASE);

      await expect(banner).toBeVisible();
      await expect(banner).toContainText('Доступна версия 99.1.0');
      await expect(banner.getByRole('link', { name: 'Что нового' })).toHaveAttribute(
        'href',
        RELEASE.notesUrl,
      );
      await expect(banner.getByRole('button', { name: 'Обновить и перезапустить' })).toBeVisible();

      await banner.getByRole('button', { name: 'Позже' }).click();
      await expect(banner).toHaveCount(0);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario A dismissed banner re-surfaces on the next announcement and follows the UI language
   * @area Settings
   * @feature Update banner
   * @type edge
   * @priority P2
   *
   * Preconditions:
   *   - Fresh userData, `--lang=ru`.
   *
   * Steps:
   *   1. Broadcast release 99.1.0, click "Позже".
   *   2. Broadcast release 99.2.0.
   *   3. Switch the UI language to English in Settings → Язык and save.
   *
   * Expected:
   *   - After step 2 the banner is back and names 99.2.0 (not the dismissed 99.1.0).
   *   - After step 3 the same banner reads "Version 99.2.0 is available" with the
   *     "Later" / "Update & restart" buttons.
   */
  test('dismissed banner re-surfaces with the newer version and is translated', async () => {
    const handles = await launchApp();
    try {
      const banner = handles.library.getByRole('status', { name: 'Update available' });

      await broadcastUpdateAvailable(handles.app, RELEASE);
      await banner.getByRole('button', { name: 'Позже' }).click();
      await expect(banner).toHaveCount(0);

      await broadcastUpdateAvailable(handles.app, { ...RELEASE, version: '99.2.0' });
      await expect(banner).toContainText('Доступна версия 99.2.0');

      const settings = new SettingsPopup(handles.library);
      await settings.open();
      await settings.gotoSection('language');
      await settings.chooseLanguage('en');
      await settings.save();

      await expect(banner).toContainText('Version 99.2.0 is available');
      await expect(banner.getByRole('button', { name: 'Later' })).toBeVisible();
      await expect(banner.getByRole('button', { name: 'Update & restart' })).toBeVisible();
    } finally {
      await handles.dispose();
    }
  });
});
