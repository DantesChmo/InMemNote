import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { loadSettings, restartApp, SettingsPopup, trySaveSettings } from '../helpers/settings';

/**
 * Settings → Хоткеи → "open Draft" accelerator.
 *
 * Under `INMEMNOTE_E2E=1` the real `globalShortcut` is disabled, so these
 * specs assert on what is observable without an OS hotkey: the capture UI,
 * the value persisted by main (read back over `settings:load`) and the value
 * shown after reopening the popup / restarting the app. Registration itself
 * is unit-tested in `src/infrastructure/electron/main/__tests__/hotkey.spec.ts`.
 *
 * Combos use Control+Option so they cannot collide with an app-menu
 * accelerator that would swallow the keystroke before the page sees it.
 */
const DEFAULT_DISPLAY = '⌘ ⇧ Space';
const CAPTURED_DISPLAY = '⌃ ⌥ K';
const CAPTURED_ACCELERATOR = 'Control+Option+K';

test.describe('Settings: hotkey capture', () => {
  /**
   * @scenario A captured hotkey is saved and shown after reopening the popup and after restart
   * @area Settings
   * @feature Hotkey
   * @type persistence
   * @priority P0
   *
   * Preconditions:
   *   - Fresh userData (default hotkey ⌘ ⇧ Space).
   *
   * Steps:
   *   1. Open Settings → Хоткеи; the default combo is displayed.
   *   2. Click "Изменить…", press Ctrl+Option+K.
   *   3. Click "Сохранить".
   *   4. Re-open Settings → Хоткеи.
   *   5. Close the app, launch it again on the same userData, open Settings → Хоткеи.
   *
   * Expected:
   *   - After step 2: the display shows "⌃ ⌥ K" and capture mode is over; "Сохранить" is enabled.
   *   - After step 3: main persisted `Control+Option+K`.
   *   - After steps 4 and 5: the display still shows "⌃ ⌥ K".
   */
  test('captured hotkey persists across popup reopen and restart', async () => {
    let handles = await launchApp();
    try {
      const settings = new SettingsPopup(handles.library);
      await settings.open();
      await settings.gotoSection('hotkeys');
      await expect(settings.hotkeyDisplay()).toHaveText(DEFAULT_DISPLAY);

      await settings.captureHotkey('Control+Alt+KeyK');
      await expect(settings.hotkeyDisplay()).toHaveText(CAPTURED_DISPLAY);
      await expect(settings.saveButton()).toBeEnabled();
      await settings.save();
      expect((await loadSettings(handles.library)).openDraftHotkey).toBe(CAPTURED_ACCELERATOR);

      await settings.open();
      await settings.gotoSection('hotkeys');
      await expect(settings.hotkeyDisplay()).toHaveText(CAPTURED_DISPLAY);

      handles = await restartApp(handles);
      const afterRestart = new SettingsPopup(handles.library);
      await afterRestart.open();
      await afterRestart.gotoSection('hotkeys');
      await expect(afterRestart.hotkeyDisplay()).toHaveText(CAPTURED_DISPLAY);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Modifier-only presses are ignored and Esc aborts capture, keeping the old hotkey
   * @area Settings
   * @feature Hotkey
   * @type negative
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData.
   *
   * Steps:
   *   1. Open Settings → Хоткеи, click "Изменить…".
   *   2. Press Shift alone.
   *   3. Press Escape.
   *
   * Expected:
   *   - After step 2: still capturing ("Нажмите комбинацию клавиш…" visible), no value change.
   *   - After step 3: capture ends, the default "⌘ ⇧ Space" is displayed, the Settings dialog
   *     is still open (Esc was consumed by the capture) and "Сохранить" is disabled.
   */
  test('modifier-only keys are ignored and Esc aborts the capture', async () => {
    const handles = await launchApp();
    try {
      const settings = new SettingsPopup(handles.library);
      await settings.open();
      await settings.gotoSection('hotkeys');

      await settings.changeHotkeyButton().click();
      await expect(settings.capturePrompt()).toBeVisible();

      await handles.library.keyboard.press('Shift');
      await expect(settings.capturePrompt()).toBeVisible();

      await handles.library.keyboard.press('Escape');
      await expect(settings.capturePrompt()).toBeHidden();
      await expect(settings.dialog()).toBeVisible();
      await expect(settings.hotkeyDisplay()).toHaveText(DEFAULT_DISPLAY);
      await expect(settings.saveButton()).toBeDisabled();
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario A captured but unsaved hotkey is discarded when the popup is cancelled
   * @area Settings
   * @feature Hotkey
   * @type negative
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData.
   *
   * Steps:
   *   1. Open Settings → Хоткеи, capture Ctrl+Option+K.
   *   2. Click the footer "Отмена".
   *   3. Re-open Settings → Хоткеи.
   *
   * Expected:
   *   - The default "⌘ ⇧ Space" is displayed again and main still stores the default.
   */
  test('cancel discards a captured hotkey', async () => {
    const handles = await launchApp();
    try {
      const settings = new SettingsPopup(handles.library);
      await settings.open();
      await settings.gotoSection('hotkeys');
      await settings.captureHotkey('Control+Alt+KeyK');
      await expect(settings.hotkeyDisplay()).toHaveText(CAPTURED_DISPLAY);

      await settings.cancelButton().click();
      await settings.expectClosed();

      await settings.open();
      await settings.gotoSection('hotkeys');
      await expect(settings.hotkeyDisplay()).toHaveText(DEFAULT_DISPLAY);
      expect((await loadSettings(handles.library)).openDraftHotkey).toBe(
        'CommandOrControl+Shift+Space',
      );
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Main rejects an invalid accelerator and keeps the previous hotkey
   * @area Settings
   * @feature Hotkey
   * @type negative
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData.
   *
   * Steps:
   *   1. From the Library renderer call `settings.save({ openDraftHotkey })` over the
   *      preload bridge with "Shift" (modifier only), then with "Bogus+K" (unknown token).
   *   2. Open Settings → Хоткеи.
   *
   * Expected:
   *   - Both calls are rejected with an "Invalid hotkey" message.
   *   - `settings.load()` and the popup still show the default ⌘ ⇧ Space.
   *
   * Notes:
   *   - The capture UI cannot emit such values (it only maps keys from the allow-list and
   *     ignores modifier-only presses), so the rejection path is exercised at the IPC
   *     boundary instead of through the keyboard.
   */
  test('invalid accelerators are rejected by main and the old value stays', async () => {
    const handles = await launchApp();
    try {
      for (const bad of ['Shift', 'Bogus+K']) {
        const result = await trySaveSettings(handles.library, { openDraftHotkey: bad });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Invalid hotkey');
      }
      expect((await loadSettings(handles.library)).openDraftHotkey).toBe(
        'CommandOrControl+Shift+Space',
      );

      const settings = new SettingsPopup(handles.library);
      await settings.open();
      await settings.gotoSection('hotkeys');
      await expect(settings.hotkeyDisplay()).toHaveText(DEFAULT_DISPLAY);
    } finally {
      await handles.dispose();
    }
  });
});
