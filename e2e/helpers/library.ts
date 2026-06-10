import type { Page } from '@playwright/test';

/**
 * Page object for the Library window.
 *
 * Keeps the selector vocabulary in one place so tests stay readable and a
 * markup change (e.g. renaming a `data-testid`) only ripples through here.
 */
export class LibraryPage {
  public constructor(private readonly page: Page) {}

  // ---------- Toolbar ----------

  public async clickNew(): Promise<void> {
    await this.page.getByRole('button', { name: /Новая/ }).click();
  }

  public async pressNewShortcut(): Promise<void> {
    await this.ensureWindowFocused();
    await this.page.keyboard.press('Meta+KeyN');
  }

  public async typeSearch(text: string): Promise<void> {
    const input = this.page.getByRole('textbox', { name: 'Search' });
    await input.click();
    await input.fill(text);
  }

  public async clearSearch(): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Search' }).focus();
    await this.page.keyboard.press('Escape');
  }

  public async pressSearchShortcut(): Promise<void> {
    await this.ensureWindowFocused();
    await this.page.keyboard.press('Meta+KeyF');
  }

  /**
   * CI runners don't grant the Library window OS focus on launch, which
   * means the window-level `keydown` listener never fires. A click on the
   * empty toolbar area lands the focus inside the page without affecting
   * input state, after which keyboard shortcuts behave as on a real Mac.
   */
  private async ensureWindowFocused(): Promise<void> {
    // The "Library" sidebar header is a non-interactive label — clicking it
    // focuses the window without selecting anything.
    await this.page.locator('aside[aria-label="Library sections"]').click({
      position: { x: 4, y: 4 },
    });
  }

  // ---------- Sidebar ----------

  public async selectFilter(label: 'Все заметки' | 'Закреплённые'): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(label) }).first().click();
  }

  // ---------- Note list ----------

  public cards() {
    return this.page.locator('[data-testid^="note-card-"]');
  }

  public async selectFirstCard(): Promise<void> {
    await this.cards().first().click();
  }

  public async cardCount(): Promise<number> {
    return this.cards().count();
  }

  /**
   * Returns the visible card titles in DOM order. The card includes an
   * empty accent-stripe `<span>` when active, so we pick the first span
   * that has visible text — which is always the title row.
   */
  public async cardTitles(): Promise<string[]> {
    return this.cards().evaluateAll((nodes) =>
      nodes.map((n) => {
        const spans = Array.from(n.querySelectorAll('span'));
        const titleSpan = spans.find((s) => (s.textContent ?? '').trim().length > 0);
        return titleSpan?.textContent?.trim() ?? '';
      }),
    );
  }

  // ---------- Editor ----------

  public editor() {
    // CodeMirror renders the editable surface as `.cm-content`. The Library
    // also uses a Draft-shared CodeMirror instance; the selector is the same.
    return this.page.locator('.cm-content');
  }

  public async typeIntoEditor(text: string): Promise<void> {
    await this.editor().click();
    await this.page.keyboard.type(text);
  }

  /**
   * Replace the editor's contents with `text` via a single paste event —
   * orders-of-magnitude faster than `typeIntoEditor` for large payloads.
   * The CM6 view handles paste in one transaction, so a multi-KB body
   * commits in milliseconds instead of one keystroke per char.
   */
  public async setEditorContent(text: string): Promise<void> {
    await this.editor().click();
    await this.page.keyboard.press('Meta+KeyA');
    await this.page.keyboard.press('Delete');
    await this.page.evaluate((payload) => {
      const target = document.querySelector('.cm-content') as HTMLElement | null;
      if (!target) throw new Error('No .cm-content element');
      const event = new ClipboardEvent('paste', { clipboardData: new DataTransfer() });
      event.clipboardData!.setData('text/plain', payload);
      target.dispatchEvent(event);
    }, text);
  }

  public async clearEditor(): Promise<void> {
    await this.editor().click();
    await this.page.keyboard.press('Meta+KeyA');
    await this.page.keyboard.press('Delete');
  }

  public async editorText(): Promise<string> {
    return (await this.editor().textContent()) ?? '';
  }

  public async clickPin(): Promise<void> {
    await this.page.getByTestId('lib-pin-btn').click();
  }

  public async clickDelete(): Promise<void> {
    await this.page.getByTestId('lib-delete-btn').click();
  }

  /** Wait until the editor visibly contains `expected`. */
  public async waitForEditorText(expected: string): Promise<void> {
    await this.page.waitForFunction(
      (text) =>
        document.querySelector('.cm-content')?.textContent?.includes(text) ?? false,
      expected,
      { timeout: 5_000 },
    );
  }

  /**
   * Wait until at least one note card surfaces `expected` in its rendered
   * title. We use this instead of a fixed `waitForTimeout` after typing,
   * because the title only updates once the 500 ms debounced autosave has
   * flushed AND main has broadcast `notes:changed` back into the renderer —
   * a chain whose total cost varies a lot between local and CI machines.
   */
  public async waitForCardTitle(expected: string): Promise<void> {
    await this.cards()
      .filter({ hasText: expected })
      .first()
      .waitFor({ timeout: 5_000 });
  }

  /** Wait until there is exactly `n` cards in the list. */
  public async waitForCardCount(n: number): Promise<void> {
    await this.page.waitForFunction(
      (expected) =>
        document.querySelectorAll('[data-testid^="note-card-"]').length === expected,
      n,
      { timeout: 5_000 },
    );
  }
}
