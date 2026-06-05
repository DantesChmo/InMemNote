import type { ElectronApplication, Page } from '@playwright/test';

import { waitForWindowByView } from './app';

/**
 * Page object for the Draft overlay.
 *
 * The overlay is summoned by a system-wide hotkey in production. Playwright
 * cannot dispatch real system hotkeys, so we invoke the `__test__:showDraft`
 * IPC channel that the main process registers when launched with
 * `INMEMNOTE_E2E=1`.
 */
export class DraftPage {
  public constructor(private readonly page: Page) {}

  public static async summon(app: ElectronApplication): Promise<DraftPage> {
    // `evaluate` runs inside main. The app exposes `globalThis.__inmemnoteTest`
    // when launched with `INMEMNOTE_E2E=1` — see `electron/main/index.ts`.
    await app.evaluate(() => {
      const t = (
        globalThis as { __inmemnoteTest?: { showDraft: () => void } }
      ).__inmemnoteTest;
      if (!t) throw new Error('App was not launched with INMEMNOTE_E2E=1');
      t.showDraft();
    });

    const draftWindow = await waitForWindowByView(app, 'draft');
    await draftWindow.waitForLoadState('domcontentloaded');
    return new DraftPage(draftWindow);
  }

  public static async hide(app: ElectronApplication): Promise<void> {
    await app.evaluate(() => {
      const t = (
        globalThis as { __inmemnoteTest?: { hideDraft: () => void } }
      ).__inmemnoteTest;
      t?.hideDraft();
    });
  }

  public get raw(): Page {
    return this.page;
  }

  public editor() {
    return this.page.locator('.cm-content');
  }

  public async typeIntoEditor(text: string): Promise<void> {
    await this.editor().click();
    await this.page.keyboard.type(text);
  }

  public async submit(): Promise<void> {
    await this.editor().focus();
    await this.page.keyboard.press('Meta+Enter');
  }

  public async cancel(): Promise<void> {
    await this.editor().focus();
    await this.page.keyboard.press('Escape');
  }

  public async clickPin(): Promise<void> {
    await this.page.getByRole('button', { name: /Закрепить/ }).click();
  }

  public async isVisible(): Promise<boolean> {
    // `isClosed()` is sync; `locator.isVisible()` is async.
    if (this.page.isClosed()) return false;
    return this.page.locator('body').isVisible();
  }
}
