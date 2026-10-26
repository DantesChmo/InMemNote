import { rmSync } from 'node:fs';

import type { Page } from '@playwright/test';

import { launchApp, type AppHandles } from './app';

type RelaunchedApp = AppHandles & { dispose: () => Promise<void> };

/**
 * Quit the app the way the user does (`app.quit()`: every window gets its
 * `beforeunload`, then `will-quit`) and boot a second instance on the SAME
 * `userData`. The returned `dispose` also removes the directory, which
 * `launchApp` leaves to the caller when it did not create it.
 */
export async function restartApp(
  previous: Pick<AppHandles, 'app' | 'userDataDir'>,
): Promise<RelaunchedApp> {
  await previous.app.close();
  return relaunchOnSameData(previous.userDataDir);
}

/**
 * Kill the main process with SIGKILL (a crash / force-quit: no `beforeunload`,
 * no `will-quit`) and boot a second instance on the same `userData`.
 */
export async function crashAndRestartApp(
  previous: Pick<AppHandles, 'app' | 'userDataDir'>,
): Promise<RelaunchedApp> {
  const proc = previous.app.process();
  const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
  proc.kill('SIGKILL');
  await exited;
  return relaunchOnSameData(previous.userDataDir);
}

async function relaunchOnSameData(userDataDir: string): Promise<RelaunchedApp> {
  const next = await launchApp({ reuseUserDataDir: userDataDir });
  return {
    ...next,
    dispose: async () => {
      await next.dispose();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

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

  /**
   * Move keyboard focus out of the editor and every text field, onto the
   * page body. Used to exercise shortcuts that deliberately ignore events
   * coming from a text target (⌘Z for the undo-delete toast).
   */
  public async focusOutsideEditor(): Promise<void> {
    await this.ensureWindowFocused();
  }

  // ---------- Sidebar ----------

  public async selectFilter(label: 'Все заметки' | 'Закреплённые'): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(label) }).first().click();
  }

  /** The count badge next to a sidebar row ("Все заметки" / "Закреплённые"). */
  public sidebarCount(label: 'Все заметки' | 'Закреплённые') {
    return this.page
      .locator('aside[aria-label="Library sections"]')
      .getByRole('button', { name: new RegExp(label) })
      .locator('span')
      .last();
  }

  // ---------- Storage banner ----------

  /** The non-dismissable "notes are not saved" strip under the Library toolbar. */
  public storageBanner() {
    return this.page.getByRole('alert').filter({ hasText: /не сохраняются/ });
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

  // ---------- Undo-delete toast ----------

  public undoToast() {
    return this.page.getByTestId('lib-undo-toast');
  }

  public async clickUndo(): Promise<void> {
    await this.page.getByTestId('lib-undo-btn').click();
  }

  public async clickDismissToast(): Promise<void> {
    await this.page.getByTestId('lib-undo-dismiss').click();
  }

  /** Card whose rendered text contains `text`. */
  public cardWithText(text: string) {
    return this.cards().filter({ hasText: text });
  }

  // ---------- What main actually holds ----------

  /**
   * Notes as the main process sees them (the same `notes:list` IPC the
   * renderer itself uses), independent of the renderer's Redux cache.
   *
   * The UI hides a soft-deleted note at once and patches the selected
   * note's body on every keystroke, so card text alone cannot tell "typed"
   * from "persisted". Poll this with `expect.poll` to wait on the real
   * store instead of sleeping through the 500 ms autosave debounce.
   */
  public async storedNotes(): Promise<
    { id: string; title: string; content: string; pinned: boolean }[]
  > {
    return this.page.evaluate(async () => {
      const list = await (
        window as unknown as {
          inmemnote: {
            notes: {
              list: (
                f: string,
              ) => Promise<{ id: string; title: string; content: string; pinned: boolean }[]>;
            };
          };
        }
      ).inmemnote.notes.list('all');
      return list.map(({ id, title, content, pinned }) => ({ id, title, content, pinned }));
    });
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
