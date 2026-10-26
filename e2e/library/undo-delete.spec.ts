import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { crashAndRestartApp, LibraryPage, restartApp } from '../helpers/library';

/**
 * Soft delete + undo toast (docs/TZ.md §4a.6).
 *
 * Deleting a note hides it at once and shows "Заметка удалена · Отменить" for
 * 6 s; the `notes:delete` IPC is only sent when the toast times out, on "×",
 * on window unload, or when another note is deleted. Because the delete is
 * deferred, the UI alone cannot tell "hidden" from "gone", so these specs
 * read what the main process holds (`LibraryPage.storedNotes`) and relaunch
 * against the same `userData` to prove what really reached SQLite.
 *
 * The 6 s timer is the behaviour under test, so the expiry specs wait for it
 * on state (`toBeHidden` with a timeout above 6 s), never on a fixed sleep.
 */

type Handles = Awaited<ReturnType<typeof launchApp>>;

/** Create a note with `text` and wait until main holds that exact body. */
async function createNote(handles: Handles, text: string): Promise<void> {
  const library = new LibraryPage(handles.library);
  await library.pressNewShortcut();
  await library.typeIntoEditor(text);
  await expect
    .poll(async () => (await library.storedNotes()).some((n) => n.content === text))
    .toBe(true);
}

/** Bodies main currently stores, newest first. */
async function storedBodies(library: LibraryPage): Promise<string[]> {
  return (await library.storedNotes()).map((n) => n.content);
}

test.describe('Library undo-delete', () => {
  /**
   * @scenario Delete hides the note at once and Undo restores and re-selects it
   * @area Library
   * @feature Soft delete / Undo toast
   * @type positive
   * @priority P0
   *
   * Steps:
   *   1. Create notes "Alpha note" then "Bravo note" (Bravo is selected).
   *   2. Click the delete button.
   *   3. Click "Отменить" in the toast.
   *
   * Expected:
   *   - After delete: only the Alpha card is listed, the toast is visible
   *     and the editor shows Alpha; the main process still holds both notes.
   *   - After Undo: both cards are back, the toast is gone, the Bravo card
   *     is the selected one and the editor shows "Bravo note".
   */
  test('delete hides the card at once; Undo restores it and re-selects it', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await createNote(handles, 'Alpha note');
      await createNote(handles, 'Bravo note');
      await expect(library.cards()).toHaveCount(2);

      await library.clickDelete();

      await expect(library.cards()).toHaveCount(1);
      await expect(library.cardWithText('Bravo note')).toHaveCount(0);
      await expect(library.undoToast()).toBeVisible();
      await library.waitForEditorText('Alpha note');
      // Deferred, not performed: main has not been told yet.
      expect(await storedBodies(library)).toContain('Bravo note');

      await library.clickUndo();

      await expect(library.cards()).toHaveCount(2);
      await expect(library.undoToast()).toBeHidden();
      await expect(library.cardWithText('Bravo note')).toHaveAttribute('aria-current', 'true');
      await library.waitForEditorText('Bravo note');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario An undone delete is permanent across a restart
   * @area Library
   * @feature Soft delete / Undo toast
   * @type persistence
   * @priority P0
   *
   * Steps:
   *   1. Create a note "Keep me", delete it, click "Отменить".
   *   2. Quit and relaunch on the same userData.
   *
   * Expected:
   *   - The relaunched Library lists exactly one card, "Keep me".
   */
  test('undo then restart: the note is still there', async () => {
    const first = await launchApp();
    let second: Awaited<ReturnType<typeof restartApp>> | undefined;
    try {
      const library = new LibraryPage(first.library);
      await createNote(first, 'Keep me');
      await library.clickDelete();
      await expect(library.cards()).toHaveCount(0);
      await library.clickUndo();
      await expect(library.cards()).toHaveCount(1);

      second = await restartApp(first);
      const relaunched = new LibraryPage(second.library);
      await expect(relaunched.cards()).toHaveCount(1);
      await expect(relaunched.cards().first()).toContainText('Keep me');
    } finally {
      await (second ?? first).dispose();
    }
  });

  /**
   * @scenario Delete right after typing keeps the typed text through Undo
   * @area Library
   * @feature Soft delete / Undo toast
   * @type race
   * @priority P1
   *
   * Steps:
   *   1. Create a note "Base text".
   *   2. Type " plus fresh words" and click delete before the 500 ms
   *      autosave debounce can fire.
   *   3. Click "Отменить".
   *
   * Expected:
   *   - The restored note's editor shows "Base text plus fresh words" and
   *     main stores the same body (the pending edit was flushed on delete,
   *     not restored from a stale copy).
   */
  test('delete immediately after typing: Undo brings back the full text', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await createNote(handles, 'Base text');

      await library.typeIntoEditor(' plus fresh words');
      await library.clickDelete();
      await expect(library.cards()).toHaveCount(0);
      await library.clickUndo();

      await library.waitForEditorText('Base text plus fresh words');
      await expect.poll(() => storedBodies(library)).toContain('Base text plus fresh words');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario When the toast expires the delete is committed
   * @area Library
   * @feature Soft delete / Undo toast
   * @type persistence
   * @priority P0
   *
   * Steps:
   *   1. Create notes "Stays" and "Goes away"; delete "Goes away".
   *   2. Do nothing until the toast disappears by itself (about 6 s).
   *   3. Quit and relaunch on the same userData.
   *
   * Expected:
   *   - While the toast is up, main still holds "Goes away".
   *   - After the toast is gone, main no longer holds it.
   *   - The relaunched Library lists exactly one card, "Stays".
   */
  test('after the toast expires the delete is permanent, also after restart', async () => {
    const first = await launchApp();
    let second: Awaited<ReturnType<typeof restartApp>> | undefined;
    try {
      const library = new LibraryPage(first.library);
      await createNote(first, 'Stays');
      await createNote(first, 'Goes away');

      await library.clickDelete();
      await expect(library.undoToast()).toBeVisible();
      expect(await storedBodies(library)).toContain('Goes away');

      // The 6 s window is the behaviour under test; wait on the toast state
      // with a timeout that comfortably exceeds it.
      await expect(library.undoToast()).toBeHidden({ timeout: 10_000 });
      await expect.poll(() => storedBodies(library)).toEqual(['Stays']);

      second = await restartApp(first);
      const relaunched = new LibraryPage(second.library);
      await expect(relaunched.cards()).toHaveCount(1);
      await expect(relaunched.cards().first()).toContainText('Stays');
    } finally {
      await (second ?? first).dispose();
    }
  });

  /**
   * @scenario ⌘Z with focus outside the editor undoes the delete
   * @area Library
   * @feature Soft delete / Undo toast / Shortcuts
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Create notes "Alpha note" and "Bravo note"; delete "Bravo note".
   *   2. Click an inert area of the sidebar so focus leaves the editor.
   *   3. Press ⌘Z.
   *
   * Expected:
   *   - The toast disappears, "Bravo note" is listed again and selected.
   */
  test('⌘Z outside the editor undoes the delete', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await createNote(handles, 'Alpha note');
      await createNote(handles, 'Bravo note');
      await library.clickDelete();
      await expect(library.undoToast()).toBeVisible();

      await library.focusOutsideEditor();
      await handles.library.keyboard.press('Meta+KeyZ');

      await expect(library.undoToast()).toBeHidden();
      await expect(library.cards()).toHaveCount(2);
      await expect(library.cardWithText('Bravo note')).toHaveAttribute('aria-current', 'true');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario ⌘Z inside the editor stays with the editor and does not undo the delete
   * @area Library
   * @feature Soft delete / Undo toast / Shortcuts
   * @type negative
   * @priority P1
   *
   * Steps:
   *   1. Create notes "Alpha note" and "Bravo note"; delete "Bravo note".
   *   2. Focus the editor (now showing "Alpha note") and press ⌘Z.
   *   3. Move focus outside the editor and press ⌘Z again.
   *
   * Expected:
   *   - After the first ⌘Z: the toast is still visible, only one card is
   *     listed, "Alpha note" keeps its text.
   *   - After the second ⌘Z: the delete is undone (so the first press did
   *     not consume or commit anything).
   */
  test('⌘Z inside the editor does not undo the delete', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await createNote(handles, 'Alpha note');
      await createNote(handles, 'Bravo note');
      await library.clickDelete();
      await expect(library.undoToast()).toBeVisible();

      await library.editor().click();
      await handles.library.keyboard.press('Meta+KeyZ');

      await expect(library.undoToast()).toBeVisible();
      await expect(library.cards()).toHaveCount(1);
      await expect(library.cardWithText('Bravo note')).toHaveCount(0);
      await library.waitForEditorText('Alpha note');

      await library.focusOutsideEditor();
      await handles.library.keyboard.press('Meta+KeyZ');
      await expect(library.undoToast()).toBeHidden();
      await expect(library.cards()).toHaveCount(2);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Deleting a second note commits the first pending delete
   * @area Library
   * @feature Soft delete / Undo toast
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Create notes "Alpha note", "Bravo note", "Charlie note".
   *   2. Delete "Charlie note", then delete "Bravo note" (selected next).
   *   3. Click "Отменить".
   *   4. Quit and relaunch on the same userData.
   *
   * Expected:
   *   - After the second delete: main no longer holds "Charlie note" but
   *     still holds "Bravo note"; the toast is visible.
   *   - Undo brings back "Bravo note" only; "Charlie note" stays gone.
   *   - After the relaunch: exactly "Alpha note" and "Bravo note" remain.
   */
  test('a second delete commits the first; Undo only restores the latest', async () => {
    const first = await launchApp();
    let second: Awaited<ReturnType<typeof restartApp>> | undefined;
    try {
      const library = new LibraryPage(first.library);
      await createNote(first, 'Alpha note');
      await createNote(first, 'Bravo note');
      await createNote(first, 'Charlie note');

      await library.clickDelete(); // Charlie, selected
      await expect(library.cardWithText('Charlie note')).toHaveCount(0);
      await library.clickDelete(); // Bravo, now selected
      await expect(library.cardWithText('Bravo note')).toHaveCount(0);

      await expect(library.undoToast()).toBeVisible();
      await expect.poll(() => storedBodies(library)).toEqual(['Bravo note', 'Alpha note']);

      await library.clickUndo();
      await expect(library.cards()).toHaveCount(2);
      await expect(library.cardWithText('Bravo note')).toHaveCount(1);
      await expect(library.cardWithText('Charlie note')).toHaveCount(0);

      second = await restartApp(first);
      const relaunched = new LibraryPage(second.library);
      await expect(relaunched.cards()).toHaveCount(2);
      await expect(relaunched.cardWithText('Alpha note')).toHaveCount(1);
      await expect(relaunched.cardWithText('Bravo note')).toHaveCount(1);
    } finally {
      await (second ?? first).dispose();
    }
  });

  /**
   * @scenario "×" on the toast commits the delete immediately
   * @area Library
   * @feature Soft delete / Undo toast
   * @type positive
   * @priority P2
   *
   * Steps:
   *   1. Create a note "Short lived"; delete it.
   *   2. Click "×" (Закрыть) on the toast.
   *
   * Expected:
   *   - The toast disappears at once and main no longer holds the note
   *     (no 6 s wait needed).
   */
  test('dismissing the toast with × commits the delete without waiting', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await createNote(handles, 'Short lived');
      await library.clickDelete();
      await expect(library.undoToast()).toBeVisible();

      await library.clickDismissToast();

      await expect(library.undoToast()).toBeHidden();
      await expect.poll(() => storedBodies(library)).toEqual([]);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Hovering the toast pauses its timer; leaving resumes it
   * @area Library
   * @feature Soft delete / Undo toast
   * @type positive
   * @priority P2
   *
   * Steps:
   *   1. Create a note "Hover me"; delete it.
   *   2. Move the mouse onto the toast and keep it there for 6.5 s (longer
   *      than the 6 s window).
   *   3. Move the mouse away.
   *
   * Expected:
   *   - The toast is still visible after 6.5 s of hover and main still holds
   *     the note (an unpaused toast would have committed at 6 s).
   *   - After the mouse leaves, the toast times out by itself and main no
   *     longer holds the note.
   */
  test('hovering the toast keeps it past 6 s; leaving lets it expire', async () => {
    test.setTimeout(45_000);
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await createNote(handles, 'Hover me');
      await library.clickDelete();
      await expect(library.undoToast()).toBeVisible();

      // The scenario itself is "still there after the 6 s window": there is
      // no state change to wait on, only elapsed time to outlast. A user
      // keeps the pointer parked on the toast, so the loop re-asserts the
      // hover: another process taking OS focus makes Chromium drop the
      // `:hover` state, and the timer would (correctly) resume.
      const hoverUntil = Date.now() + 6_500;
      do {
        const toast = library.undoToast();
        if ((await toast.count()) === 0) break;
        if (!(await toast.evaluate((el) => el.matches(':hover')))) {
          await toast.hover();
        }
        await handles.library.waitForTimeout(100);
      } while (Date.now() < hoverUntil);
      await expect(library.undoToast()).toBeVisible();
      expect(await storedBodies(library)).toContain('Hover me');

      await handles.library.mouse.move(700, 200);
      await expect(library.undoToast()).toBeHidden({ timeout: 10_000 });
      await expect.poll(() => storedBodies(library)).toEqual([]);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Quitting with the toast still up commits the delete
   * @area Library
   * @feature Soft delete / Undo toast / Quit
   * @type persistence
   * @priority P1
   *
   * Steps:
   *   1. Create a note "Quit victim"; delete it (toast is up).
   *   2. Quit the app normally (app.quit) and relaunch on the same userData.
   *
   * Expected:
   *   - The note is gone: the user saw it disappear, and the window-unload
   *     hook commits the pending delete (TZ §4a.6).
   */
  test('a graceful quit with a pending delete commits it', async () => {
    const first = await launchApp();
    let second: Awaited<ReturnType<typeof restartApp>> | undefined;
    try {
      const library = new LibraryPage(first.library);
      await createNote(first, 'Quit victim');
      await library.clickDelete();
      await expect(library.undoToast()).toBeVisible();

      second = await restartApp(first);
      await expect(new LibraryPage(second.library).cards()).toHaveCount(0);
    } finally {
      await (second ?? first).dispose();
    }
  });

  /**
   * @scenario A crash with the toast still up leaves the note intact (safe failure)
   * @area Library
   * @feature Soft delete / Undo toast / Crash
   * @type persistence
   * @priority P1
   *
   * Steps:
   *   1. Create a note "Crash survivor"; delete it (toast is up).
   *   2. SIGKILL the main process (no beforeunload, no will-quit), then
   *      relaunch on the same userData.
   *
   * Expected:
   *   - The note is back in the Library with its text: the delete was never
   *     sent, which is the documented safe failure.
   */
  test('a crash with a pending delete keeps the note', async () => {
    const first = await launchApp();
    let second: Awaited<ReturnType<typeof crashAndRestartApp>> | undefined;
    try {
      const library = new LibraryPage(first.library);
      await createNote(first, 'Crash survivor');
      await library.clickDelete();
      await expect(library.undoToast()).toBeVisible();

      second = await crashAndRestartApp(first);
      const relaunched = new LibraryPage(second.library);
      await expect(relaunched.cards()).toHaveCount(1);
      await expect(relaunched.cards().first()).toContainText('Crash survivor');
    } finally {
      await (second ?? first).dispose();
    }
  });
});
