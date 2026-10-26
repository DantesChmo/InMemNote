import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';
import {
  expectInlineToken,
  loadSettings,
  resolvedToken,
  restartApp,
  SettingsPopup,
} from '../helpers/settings';

/**
 * Settings → Палитра → per-token colour overrides.
 *
 * An override is applied as an inline custom property on `<html>`
 * (`--accent: #ff0000`), so "is it applied" == `style.getPropertyValue`, and
 * "is it the theme default" == the property is NOT set inline. The native
 * `<input type="color">` is driven with `fill()`, which assigns the value and
 * fires `input` + `change` exactly like the OS picker does.
 */
test.describe('Settings: palette', () => {
  /**
   * @scenario Colour change previews live and Esc restores the persisted palette
   * @area Settings
   * @feature Palette
   * @type positive
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData (no overrides).
   *
   * Steps:
   *   1. Note the resolved `--accent` (theme default).
   *   2. Open Settings, set the "accent" picker to #ff0000.
   *   3. Click the dialog title (moves focus off the colour input) and press Escape.
   *
   * Expected:
   *   - After step 2: `--accent` resolves to #ff0000 immediately, nothing is
   *     persisted yet (palette in the DB is empty).
   *   - After step 3: no inline `--accent` is left and the resolved value is
   *     the original theme default again.
   */
  test('accent previews live and Esc rolls it back', async () => {
    const handles = await launchApp();
    try {
      const page = handles.library;
      const settings = new SettingsPopup(page);
      const defaultAccent = await resolvedToken(page, 'accent');

      await settings.open();
      await settings.setColor('accent', '#ff0000');
      await expectInlineToken(page, 'accent', '#ff0000');
      await expect.poll(() => resolvedToken(page, 'accent')).toBe('#ff0000');
      expect((await loadSettings(page)).palette).toEqual({});

      // Esc from the dialog body; Esc with the colour input still focused has
      // its own test below.
      await settings.dialog().getByText('Настройки', { exact: true }).click();
      await page.keyboard.press('Escape');
      await settings.expectClosed();
      await expectInlineToken(page, 'accent', '');
      expect(await resolvedToken(page, 'accent')).toBe(defaultAccent);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Esc closes the modal right after picking a colour (focus still on the colour input)
   * @area Settings
   * @feature Palette
   * @type edge
   * @priority P2
   *
   * Preconditions:
   *   - Fresh userData.
   *
   * Steps:
   *   1. Open Settings, set "accent" to #ff0000 (focus stays on the colour input).
   *   2. Press Escape without touching anything else.
   *
   * Expected:
   *   - The dialog closes and the preview is rolled back.
   *
   * Notes:
   *   - Regression: `SettingsPopup` used to ignore Esc whenever the event target was an
   *     `<input>` (meant for text fields), so a focused colour input swallowed it.
   */
  test('Esc closes the modal while the colour input still has focus', async () => {
    const handles = await launchApp();
    try {
      const page = handles.library;
      const settings = new SettingsPopup(page);
      await settings.open();
      await settings.setColor('accent', '#ff0000');
      await page.keyboard.press('Escape');
      await settings.expectClosed();
      await expectInlineToken(page, 'accent', '');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Footer Cancel after a colour change also rolls the palette back
   * @area Settings
   * @feature Palette
   * @type negative
   * @priority P2
   *
   * Preconditions:
   *   - Fresh userData.
   *
   * Steps:
   *   1. Open Settings, set "text" to #00ff00 (live preview).
   *   2. Click the footer "Отмена".
   *
   * Expected:
   *   - Inline `--text` is cleared and nothing is persisted.
   */
  test('Cancel button rolls an unsaved colour back', async () => {
    const handles = await launchApp();
    try {
      const page = handles.library;
      const settings = new SettingsPopup(page);
      await settings.open();
      await settings.setColor('text', '#00ff00');
      await expectInlineToken(page, 'text', '#00ff00');

      await settings.cancelButton().click();
      await settings.expectClosed();
      await expectInlineToken(page, 'text', '');
      expect((await loadSettings(page)).palette).toEqual({});
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Saved colour persists across restart and reaches an open Draft window
   * @area Settings
   * @feature Palette
   * @type persistence
   * @priority P0
   *
   * Preconditions:
   *   - Fresh userData; the Draft window has been summoned.
   *
   * Steps:
   *   1. In Library open Settings, set "accent" to #ff0000, click "Сохранить".
   *   2. Close the app and launch it again on the same userData.
   *   3. Summon Draft.
   *
   * Expected:
   *   - After step 1: Library and the already-open Draft both carry inline
   *     `--accent: #ff0000`; the DB palette is `{ accent: "#ff0000" }`.
   *   - After step 2: Library has the override without opening Settings.
   *   - After step 3: the (new) Draft window has it as well.
   */
  test('saved accent persists across restart and reaches the Draft window', async () => {
    let handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      const settings = new SettingsPopup(handles.library);
      await settings.open();
      await settings.setColor('accent', '#ff0000');
      await settings.save();

      await expectInlineToken(handles.library, 'accent', '#ff0000');
      await expectInlineToken(draft.raw, 'accent', '#ff0000');
      expect((await loadSettings(handles.library)).palette).toEqual({ accent: '#ff0000' });

      handles = await restartApp(handles);
      await expectInlineToken(handles.library, 'accent', '#ff0000');

      const draftAfter = await DraftPage.summon(handles.app);
      await expectInlineToken(draftAfter.raw, 'accent', '#ff0000');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Per-token "Сброс" returns only that token to the theme default
   * @area Settings
   * @feature Palette
   * @type positive
   * @priority P1
   *
   * Preconditions:
   *   - Fresh userData; "accent" = #ff0000 and "text" = #00ff00 are saved.
   *
   * Steps:
   *   1. Re-open Settings → Палитра; "Сброс" is enabled for accent and text.
   *   2. Click "Сброс" on the accent row.
   *   3. Click "Сохранить".
   *
   * Expected:
   *   - "Сброс" is disabled for tokens without an override (e.g. panel).
   *   - After step 2: inline `--accent` is gone at once (live), `--text` keeps
   *     its override, and the accent resolves to the original theme default.
   *   - After step 3: the DB palette is `{ text: "#00ff00" }`.
   */
  test('Reset returns one token to the theme default and keeps the others', async () => {
    const handles = await launchApp();
    try {
      const page = handles.library;
      const settings = new SettingsPopup(page);
      const defaultAccent = await resolvedToken(page, 'accent');

      await settings.open();
      await expect(settings.resetButton('accent')).toBeDisabled();
      await settings.setColor('accent', '#ff0000');
      await settings.setColor('text', '#00ff00');
      await settings.save();
      await expectInlineToken(page, 'accent', '#ff0000');

      await settings.open();
      await expect(settings.resetButton('accent')).toBeEnabled();
      await expect(settings.resetButton('text')).toBeEnabled();
      await expect(settings.resetButton('panel')).toBeDisabled();

      await settings.resetButton('accent').click();
      await expectInlineToken(page, 'accent', '');
      await expectInlineToken(page, 'text', '#00ff00');
      expect(await resolvedToken(page, 'accent')).toBe(defaultAccent);
      await expect(settings.resetButton('accent')).toBeDisabled();

      await settings.save();
      expect((await loadSettings(page)).palette).toEqual({ text: '#00ff00' });
      await expectInlineToken(page, 'accent', '');
    } finally {
      await handles.dispose();
    }
  });
});
