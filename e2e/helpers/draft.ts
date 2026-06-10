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

  /**
   * True if a Draft BrowserWindow currently exists in the app. Useful for
   * race-condition tests where a window may have been closed between
   * actions.
   */
  public static async draftWindowExistsInApp(app: ElectronApplication): Promise<boolean> {
    return app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) =>
        w.webContents.getURL().includes('view=draft'),
      ),
    );
  }

  /** Whether the main process reports the Draft window as visible. */
  public static async draftIsVisibleInApp(app: ElectronApplication): Promise<boolean> {
    return app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('view=draft'),
      );
      return !!w && !w.isDestroyed() && w.isVisible();
    });
  }

  public static async draftBounds(
    app: ElectronApplication,
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('view=draft'),
      );
      return w?.getBounds() ?? null;
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

  /**
   * Replace the editor's contents wholesale via direct paste-style input —
   * faster than typing for long strings and bypasses CodeMirror's auto-indent
   * heuristics that can muddle keystroke-driven input on Markdown lists.
   */
  public async setEditorContent(text: string): Promise<void> {
    await this.editor().click();
    await this.selectAll();
    await this.page.keyboard.press('Delete');
    // Type via clipboard-style insertion: dispatch a paste event to the
    // CM6 view. CodeMirror handles `paste` as a single transaction, so
    // even huge payloads commit quickly without ResizeObserver thrash.
    await this.page.evaluate((payload) => {
      const view = (window as unknown as { __cmView?: unknown }).__cmView;
      void view;
      const target = document.querySelector('.cm-content') as HTMLElement | null;
      if (!target) throw new Error('No .cm-content element');
      const event = new ClipboardEvent('paste', { clipboardData: new DataTransfer() });
      event.clipboardData!.setData('text/plain', payload);
      target.dispatchEvent(event);
    }, text);
  }

  public async selectAll(): Promise<void> {
    await this.editor().focus();
    await this.page.keyboard.press('Meta+KeyA');
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
    // Stable selector — aria-label flips between Закрепить/Открепить with
    // the pinned state, but `data-testid` does not.
    await this.page.getByTestId('draft-pin-btn').click();
  }

  public async isVisible(): Promise<boolean> {
    // `isClosed()` is sync; `locator.isVisible()` is async.
    if (this.page.isClosed()) return false;
    return this.page.locator('body').isVisible();
  }

  /** Current editor text via DOM `.cm-content`. */
  public async editorText(): Promise<string> {
    return (await this.editor().textContent()) ?? '';
  }
}
