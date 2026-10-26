import { rmSync } from 'node:fs';

import { expect, type ElectronApplication, type Page } from '@playwright/test';

import { launchApp, waitForWindowByView, type AppHandles } from './app';

/**
 * Helpers for the Settings popup, i18n and update-banner specs.
 *
 * Every accessible name is matched against BOTH dictionaries (ru | en)
 * because the language scenarios flip the UI language mid-test; a helper
 * that only knew the Russian copy would stop working after the switch.
 */

export type PaletteToken =
  | 'accent'
  | 'accent-ink'
  | 'panel'
  | 'panel-2'
  | 'sink'
  | 'text'
  | 'text-2'
  | 'text-3'
  | 'bar';

type Section = 'palette' | 'hotkeys' | 'language';

const SECTION_NAME: Record<Section, RegExp> = {
  palette: /^(Палитра|Palette)$/,
  hotkeys: /^(Хоткеи|Hotkeys)$/,
  language: /^(Язык|Language)$/,
};

/** Page object for the Settings modal that lives inside the Library window. */
export class SettingsPopup {
  public constructor(public readonly page: Page) {}

  // ---------- Locators ----------

  public gearButton() {
    return this.page.getByRole('button', { name: /^(Настройки|Settings)$/ });
  }

  public dialog() {
    return this.page.getByRole('dialog', { name: /^(Настройки|Settings)$/ });
  }

  /** The full-window dim layer that wraps the dialog (parent of the dialog). */
  public dimLayer() {
    return this.dialog().locator('xpath=..');
  }

  public saveButton() {
    return this.dialog().getByRole('button', { name: /^(Сохранить|Сохраняем…|Save|Saving…)$/ });
  }

  /** Footer "Cancel" (the last "Cancel" in DOM order; the hotkey capture has its own). */
  public cancelButton() {
    return this.dialog()
      .getByRole('button', { name: /^(Отмена|Cancel)$/ })
      .last();
  }

  public headerCloseButton() {
    return this.dialog().getByRole('button', { name: /^(Закрыть|Close)$/ });
  }

  // ---------- Actions ----------

  public async open(): Promise<void> {
    await this.gearButton().click();
    await expect(this.dialog()).toBeVisible();
  }

  /** Wait for the exit animation to finish and the dialog to leave the DOM. */
  public async expectClosed(): Promise<void> {
    await expect(this.dialog()).toBeHidden();
  }

  public async gotoSection(section: Section): Promise<void> {
    await this.dialog()
      .getByRole('navigation')
      .getByRole('button', { name: SECTION_NAME[section] })
      .click();
  }

  public async chooseTheme(mode: 'system' | 'dark' | 'light'): Promise<void> {
    const name = {
      system: /^(Системная|System)$/,
      dark: /^(Тёмная|Dark)$/,
      light: /^(Светлая|Light)$/,
    }[mode];
    await this.dialog().getByRole('button', { name }).click();
  }

  public async chooseLanguage(mode: 'system' | 'en' | 'ru'): Promise<void> {
    const name = {
      system: /^(Системный|System)$/,
      en: /^English$/,
      ru: /^Русский$/,
    }[mode];
    await this.dialog().getByRole('button', { name }).click();
  }

  /**
   * The native colour input of one palette row. It is visually hidden
   * (opacity 0 inside a `<label aria-label="… {key}">`) and has no accessible
   * name of its own, so we address it through its wrapping label.
   */
  public colorInput(token: PaletteToken) {
    return this.colorLabel(token).locator('input[type="color"]');
  }

  /**
   * Set a colour the way the OS picker would: Playwright's `fill` on a colour
   * input assigns the value and dispatches `input` + `change`, which is what
   * React's `onChange` listens to.
   */
  public async setColor(token: PaletteToken, hex: string): Promise<void> {
    await this.colorInput(token).fill(hex);
  }

  /** The per-token "Сброс" / "Reset" button, found via the row's colour label. */
  public resetButton(token: PaletteToken) {
    return this.colorLabel(token)
      .locator('xpath=..')
      .getByRole('button', { name: /^(Сброс|Reset)$/ });
  }

  public async save(): Promise<void> {
    await this.saveButton().click();
    await this.expectClosed();
  }

  // ---------- Hotkey capture ----------

  public changeHotkeyButton() {
    return this.dialog().getByRole('button', { name: /^(Изменить…|Change…)$/ });
  }

  public hotkeyDisplay() {
    return this.dialog().getByTestId('hotkey-input').locator('span.font-mono');
  }

  public capturePrompt() {
    return this.dialog().getByText(/^(Нажмите комбинацию клавиш…|Press a key combination…)$/);
  }

  /** Enter capture mode and press `combo` (Playwright key syntax, e.g. `Meta+Shift+KeyK`). */
  public async captureHotkey(combo: string): Promise<void> {
    await this.changeHotkeyButton().click();
    await expect(this.capturePrompt()).toBeVisible();
    await this.page.keyboard.press(combo);
  }

  private colorLabel(token: PaletteToken) {
    // The aria-label ends with the raw token key; `$=" key"` keeps `accent`
    // from also matching `accent-ink`.
    return this.dialog().locator(`label[aria-label$=" ${token}"]`);
  }
}

// ---------- DOM state read helpers ----------

/** Inline (override) value of `--token` on `<html>`; `''` when not overridden. */
export function inlineToken(page: Page, token: PaletteToken): Promise<string> {
  return page.evaluate(
    (key) => document.documentElement.style.getPropertyValue(`--${key}`).trim(),
    token,
  );
}

/** Resolved value of `--token` (theme default unless overridden). */
export function resolvedToken(page: Page, token: PaletteToken): Promise<string> {
  return page.evaluate(
    (key) => getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim(),
    token,
  );
}

/** Assert `<html data-theme>` (retries: main pushes persisted settings after first paint). */
export async function expectTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

export async function expectInlineToken(
  page: Page,
  token: PaletteToken,
  expected: string,
): Promise<void> {
  await expect.poll(() => inlineToken(page, token)).toBe(expected);
}

// ---------- Lifecycle ----------

type DisposableHandles = AppHandles & { dispose: () => Promise<void> };

/**
 * Close the app and boot it again on the SAME userData dir.
 *
 * The returned handle's `dispose` also removes the dir (`launchApp` only
 * cleans dirs it provisioned itself). Callers reassign their handle:
 * `h = await restartApp(h)` so the `finally { h.dispose() }` always targets
 * the live instance.
 */
export async function restartApp(prev: DisposableHandles): Promise<DisposableHandles> {
  const dir = prev.userDataDir;
  await prev.app.close();
  let next: DisposableHandles;
  try {
    next = await launchApp({ reuseUserDataDir: dir });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return {
    ...next,
    dispose: async () => {
      await next.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Persisted settings as the main process sees them — the same IPC the popup
 * uses, issued from the renderer through the preload bridge.
 */
export interface SettingsSnapshot {
  themeMode: string;
  language: string;
  openDraftHotkey: string;
  palette: Record<string, string>;
}

interface SettingsBridge {
  inmemnote: {
    settings: {
      load(): Promise<SettingsSnapshot>;
      save(patch: Partial<SettingsSnapshot>): Promise<SettingsSnapshot>;
    };
  };
}

export function loadSettings(page: Page): Promise<SettingsSnapshot> {
  return page.evaluate(() => (window as unknown as SettingsBridge).inmemnote.settings.load());
}

/**
 * Call `settings.save(patch)` straight over the bridge and report whether main
 * accepted it. Used for values the popup UI cannot produce (e.g. an
 * accelerator the domain rejects).
 */
export function trySaveSettings(
  page: Page,
  patch: Partial<SettingsSnapshot>,
): Promise<{ ok: boolean; error?: string }> {
  return page.evaluate(async (p) => {
    try {
      await (window as unknown as SettingsBridge).inmemnote.settings.save(p);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, patch);
}

// ---------- Update banner ----------

export interface FakeRelease {
  version: string;
  downloadUrl: string;
  notesUrl: string;
}

/**
 * Broadcast `update:available` from the main process to the Library
 * webContents only — exactly what `registerUpdateIpc.checkNow()` does when a
 * newer release is found. The channel string is passed in so this file does
 * not import from `src/`.
 */
export async function broadcastUpdateAvailable(
  app: ElectronApplication,
  release: FakeRelease,
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, { channel, payload }) => {
      const lib = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('view=library'),
      );
      if (!lib) throw new Error('No Library window');
      lib.webContents.send(channel, payload);
    },
    { channel: 'update:available', payload: release },
  );
}

/** Page for the Draft window, assuming it has already been summoned. */
export function draftPage(app: ElectronApplication): Promise<Page> {
  return waitForWindowByView(app, 'draft');
}
