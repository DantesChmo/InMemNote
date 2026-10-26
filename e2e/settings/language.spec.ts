import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';
import { loadSettings, restartApp, SettingsPopup } from '../helpers/settings';

/**
 * Settings → Язык / i18n.
 *
 * `launchApp` starts Electron with `--lang=ru`, so `navigator.language` is
 * Russian and the default mode ("system") resolves to the Russian dictionary.
 * Observable outcomes: visible strings in Library and Draft, `<html lang>`,
 * and persistence across restart. Strings are matched literally in both
 * languages on purpose: a swapped dictionary is the regression we want to see.
 */
test.describe('Settings: language', () => {
  /**
   * @scenario Switching to English retranslates Library, sets html lang and survives restart
   * @area Settings
   * @feature Language
   * @type persistence
   * @priority P0
   *
   * Preconditions:
   *   - Fresh userData, launched with `--lang=ru` (language mode "system" → Russian).
   *
   * Steps:
   *   1. Verify Russian: toolbar button "Новая", `<html lang="ru">`.
   *   2. Open Settings → Язык, pick "English", click "Сохранить".
   *   3. Close the app, launch it again on the same userData.
   *
   * Expected:
   *   - After step 2: toolbar shows "New", gear is named "Settings", sidebar shows "All notes",
   *     `<html lang="en">`; main persisted `language: "en"`.
   *   - After step 3: the Library boots in English with `<html lang="en">`.
   */
  test('English retranslates the Library, sets html lang and persists', async () => {
    let handles = await launchApp();
    try {
      const page = handles.library;
      await expect(page.getByRole('button', { name: /Новая/ })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

      const settings = new SettingsPopup(page);
      await settings.open();
      await settings.gotoSection('language');
      await settings.chooseLanguage('en');
      await settings.save();

      await expect(page.getByRole('button', { name: /^New/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
      await expect(page.getByRole('button', { name: /All notes/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Новая/ })).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      expect((await loadSettings(page)).language).toBe('en');

      handles = await restartApp(handles);
      await expect(handles.library.getByRole('button', { name: /^New/ })).toBeVisible();
      await expect(handles.library.locator('html')).toHaveAttribute('lang', 'en');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario An open Draft window switches language after a save in Library
   * @area Settings
   * @feature Language
   * @type positive
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData, `--lang=ru`; the Draft window has been summoned.
   *
   * Steps:
   *   1. Verify the Draft header reads "Быстрая заметка".
   *   2. In Library open Settings → Язык, pick "English", save.
   *
   * Expected:
   *   - The Draft header now reads "Quick note" with no action in the Draft window.
   */
  test('saved language is picked up by an open Draft window', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await expect(draft.raw.getByText('Быстрая заметка')).toBeVisible();

      const settings = new SettingsPopup(handles.library);
      await settings.open();
      await settings.gotoSection('language');
      await settings.chooseLanguage('en');
      await settings.save();

      await expect(draft.raw.getByText('Quick note')).toBeVisible();
      await expect(draft.raw.getByText('Быстрая заметка')).toHaveCount(0);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario An open Draft window keeps `<html lang>` in sync with a language-only change
   * @area Settings
   * @feature Language
   * @type edge
   * @priority P2
   *
   * Preconditions:
   *   - Fresh userData, `--lang=ru`; the Draft window has been summoned (`lang="ru"`).
   *
   * Steps:
   *   1. In Library open Settings → Язык, pick "English", save (nothing else changes).
   *
   * Expected:
   *   - The Draft window's `<html lang>` becomes "en" (spellcheck / screen-reader language).
   *
   * Notes:
   *   - Regression: `sameAppearance` (`src/presentation/settings/applyTheme.ts`) used to ignore
   *     `language`, so a language-only broadcast never re-ran `applyAppearance` in a window
   *     that did not host the popup; the Draft kept `lang="ru"` while its strings were English.
   */
  test('Draft html lang follows a language-only change', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await expect(draft.raw.locator('html')).toHaveAttribute('lang', 'ru');

      const settings = new SettingsPopup(handles.library);
      await settings.open();
      await settings.gotoSection('language');
      await settings.chooseLanguage('en');
      await settings.save();

      await expect(draft.raw.getByText('Quick note')).toBeVisible();
      await expect(draft.raw.locator('html')).toHaveAttribute('lang', 'en');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Switching back to "Системный" returns the UI to the OS language (Russian)
   * @area Settings
   * @feature Language
   * @type positive
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData, `--lang=ru`; "English" already saved (UI is English).
   *
   * Steps:
   *   1. Open Settings ("Settings") → Language, pick "System", click "Save".
   *
   * Expected:
   *   - Toolbar reads "Новая" again, `<html lang="ru">`, main persisted `language: "system"`.
   */
  test('"system" returns the UI to Russian', async () => {
    const handles = await launchApp();
    try {
      const page = handles.library;
      const settings = new SettingsPopup(page);

      await settings.open();
      await settings.gotoSection('language');
      await settings.chooseLanguage('en');
      await settings.save();
      await expect(page.getByRole('button', { name: /^New/ })).toBeVisible();

      await settings.open();
      await settings.gotoSection('language');
      await settings.chooseLanguage('system');
      await settings.save();

      await expect(page.getByRole('button', { name: /Новая/ })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
      expect((await loadSettings(page)).language).toBe('system');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario An unsaved language choice is not applied and is rolled back on Cancel
   * @area Settings
   * @feature Language
   * @type negative
   * @priority P2
   *
   * Preconditions:
   *   - Fresh userData, `--lang=ru`.
   *
   * Steps:
   *   1. Open Settings → Язык, pick "English" without saving.
   *   2. Click the footer "Отмена".
   *
   * Expected:
   *   - Library strings stay Russian throughout, `<html lang="ru">` after Cancel,
   *     and main still stores `language: "system"`.
   */
  test('cancel leaves the language untouched', async () => {
    const handles = await launchApp();
    try {
      const page = handles.library;
      const settings = new SettingsPopup(page);
      await settings.open();
      await settings.gotoSection('language');
      await settings.chooseLanguage('en');
      await expect(settings.saveButton()).toBeEnabled();

      await settings.cancelButton().click();
      await settings.expectClosed();

      await expect(page.getByRole('button', { name: /Новая/ })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
      expect((await loadSettings(page)).language).toBe('system');
    } finally {
      await handles.dispose();
    }
  });
});
