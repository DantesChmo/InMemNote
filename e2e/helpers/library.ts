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
    await this.page.keyboard.press('Meta+KeyF');
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

  public async clearEditor(): Promise<void> {
    await this.editor().click();
    await this.page.keyboard.press('Meta+KeyA');
    await this.page.keyboard.press('Delete');
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
}
