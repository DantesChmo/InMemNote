import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { loadSettings, SettingsPopup } from '../helpers/settings';

/**
 * Settings popup — entry and exit.
 *
 * The popup is a modal rendered inside the Library renderer (not a separate
 * BrowserWindow). Every way of leaving it without saving must close it and
 * leave persisted state untouched; the section-specific behaviour (theme,
 * palette, hotkey, language) has its own spec file.
 */
test.describe('Settings popup: entry / exit', () => {
  /**
   * @scenario Gear button opens the Settings modal; Save is disabled until something changes
   * @area Settings
   * @feature Entry / Exit
   * @type positive
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData, Library window open, UI in Russian (`--lang=ru`).
   *
   * Steps:
   *   1. Verify no dialog is present.
   *   2. Click the gear button in the Library toolbar ("Настройки").
   *
   * Expected:
   *   - A modal dialog "Настройки" becomes visible with the three sections
   *     Палитра / Хоткеи / Язык in its navigation.
   *   - "Сохранить" is disabled (the form equals the persisted state).
   *   - The first section (Палитра) is shown: theme switcher is visible.
   */
  test('gear button opens the modal with three sections and a disabled Save', async () => {
    const handles = await launchApp();
    try {
      const settings = new SettingsPopup(handles.library);
      await expect(settings.dialog()).toHaveCount(0);

      await settings.open();

      const nav = settings.dialog().getByRole('navigation');
      await expect(nav.getByRole('button', { name: 'Палитра' })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Хоткеи' })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Язык' })).toBeVisible();

      await expect(settings.dialog().getByRole('button', { name: 'Тёмная' })).toBeVisible();
      await expect(settings.saveButton()).toBeDisabled();
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Esc closes the Settings modal and discards an unsaved change
   * @area Settings
   * @feature Entry / Exit
   * @type positive
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData, Library window open.
   *
   * Steps:
   *   1. Open Settings.
   *   2. Switch the theme to a different mode (live preview) so the form is dirty.
   *   3. Press Escape.
   *   4. Re-open Settings.
   *
   * Expected:
   *   - The dialog disappears after Esc.
   *   - Re-opened, the form is clean again: "Сохранить" is disabled.
   *   - Persisted `themeMode` is still `system`.
   */
  test('Esc closes the modal and drops unsaved edits', async () => {
    const handles = await launchApp();
    try {
      const settings = new SettingsPopup(handles.library);
      await settings.open();
      await settings.chooseTheme('dark');
      await expect(settings.saveButton()).toBeEnabled();

      await handles.library.keyboard.press('Escape');
      await settings.expectClosed();

      await settings.open();
      await expect(settings.saveButton()).toBeDisabled();
      expect((await loadSettings(handles.library)).themeMode).toBe('system');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Clicking the dim layer closes the modal; clicking inside the dialog does not
   * @area Settings
   * @feature Entry / Exit
   * @type positive
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData, Library window open.
   *
   * Steps:
   *   1. Open Settings.
   *   2. Click on the dialog's title area (inside the panel).
   *   3. Click on the dim layer in the window corner (outside the panel).
   *
   * Expected:
   *   - After step 2 the dialog is still visible.
   *   - After step 3 the dialog is gone.
   */
  test('dim-layer click closes the modal, an inside click does not', async () => {
    const handles = await launchApp();
    try {
      const settings = new SettingsPopup(handles.library);
      await settings.open();

      await settings.dialog().getByText('Настройки', { exact: true }).click();
      await expect(settings.dialog()).toBeVisible();

      await settings.dimLayer().click({ position: { x: 4, y: 4 } });
      await settings.expectClosed();
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Header ✕ and footer "Отмена" both close the modal without saving
   * @area Settings
   * @feature Entry / Exit
   * @type positive
   * @priority P2
   *
   * Preconditions:
   *   - Fresh userData, Library window open.
   *
   * Steps:
   *   1. Open Settings, click the header "Закрыть" (✕).
   *   2. Open Settings again, click the footer "Отмена".
   *
   * Expected:
   *   - The dialog closes after each action.
   */
  test('header close and footer Cancel buttons close the modal', async () => {
    const handles = await launchApp();
    try {
      const settings = new SettingsPopup(handles.library);

      await settings.open();
      await settings.headerCloseButton().click();
      await settings.expectClosed();

      await settings.open();
      await settings.cancelButton().click();
      await settings.expectClosed();
    } finally {
      await handles.dispose();
    }
  });
});
