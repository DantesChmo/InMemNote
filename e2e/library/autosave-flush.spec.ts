import { expect, test } from '@playwright/test';

import { waitForWindowByView, launchApp } from '../helpers/app';
import { LibraryPage, restartApp } from '../helpers/library';

/**
 * Library autosave flush (bug #01) and ⌘↵ (bug #06) on the real paths.
 *
 * The editor debounces saves by 500 ms. Anything the user typed inside that
 * window used to be dropped on note switch, window close and quit. The unit
 * specs prove the renderer posts the write; these specs prove the text really
 * reaches SQLite when the app goes through the real unload / quit sequence.
 *
 * "Within 500 ms" is the behaviour under test, so the specs act immediately
 * after typing rather than waiting; they never sleep to *avoid* the race.
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

async function storedBodies(library: LibraryPage): Promise<string[]> {
  return (await library.storedNotes()).map((n) => n.content);
}

test.describe('Library autosave flush', () => {
  /**
   * @scenario Typing then switching notes within 500 ms keeps the full text
   * @area Library
   * @feature Autosave / Note switch
   * @type race
   * @priority P0
   *
   * Steps:
   *   1. Create notes "Alpha" and "Bravo" and wait until both are stored.
   *   2. Select "Alpha", type " tail" and click the "Bravo" card straight
   *      away (inside the 500 ms debounce).
   *   3. Quit and relaunch on the same userData.
   *
   * Expected:
   *   - Main stores "Alpha tail" without waiting for the debounce, and
   *     "Bravo" is untouched.
   *   - After the relaunch the "Alpha tail" card is still there.
   */
  test('typing then switching notes inside 500 ms does not drop the tail', async () => {
    const first = await launchApp();
    let second: Awaited<ReturnType<typeof restartApp>> | undefined;
    try {
      const library = new LibraryPage(first.library);
      await createNote(first, 'Alpha');
      await createNote(first, 'Bravo');
      await expect(library.cards()).toHaveCount(2);

      await library.cardWithText('Alpha').click();
      await library.waitForEditorText('Alpha');
      await library.typeIntoEditor(' tail');
      await library.cardWithText('Bravo').click();
      await library.waitForEditorText('Bravo');

      await expect.poll(() => storedBodies(library)).toContain('Alpha tail');
      expect(await storedBodies(library)).toContain('Bravo');

      second = await restartApp(first);
      const relaunched = new LibraryPage(second.library);
      await expect(relaunched.cards()).toHaveCount(2);
      await expect(relaunched.cardWithText('Alpha tail')).toHaveCount(1);
    } finally {
      await (second ?? first).dispose();
    }
  });

  /**
   * @scenario Typing then quitting the app within 500 ms keeps the full text
   * @area Library
   * @feature Autosave / Quit
   * @type persistence
   * @priority P0
   *
   * Steps:
   *   1. Create a note "Before quit" and wait until it is stored.
   *   2. Type " and after" and quit the app immediately (inside the 500 ms
   *      debounce).
   *   3. Relaunch on the same userData.
   *
   * Expected:
   *   - The relaunched Library lists one card and its editor shows
   *     "Before quit and after".
   */
  test('typing then quitting inside 500 ms does not drop the tail', async () => {
    const first = await launchApp();
    let second: Awaited<ReturnType<typeof restartApp>> | undefined;
    try {
      const library = new LibraryPage(first.library);
      await createNote(first, 'Before quit');

      await library.typeIntoEditor(' and after');
      second = await restartApp(first);

      const relaunched = new LibraryPage(second.library);
      await expect(relaunched.cards()).toHaveCount(1);
      await relaunched.cards().first().click();
      await relaunched.waitForEditorText('Before quit and after');
    } finally {
      await (second ?? first).dispose();
    }
  });

  /**
   * @scenario Typing then closing the Library window within 500 ms keeps the full text
   * @area Library
   * @feature Autosave / Window close
   * @type persistence
   * @priority P1
   *
   * Steps:
   *   1. Create a note "Window text" and wait until it is stored.
   *   2. Type " survives close" and close the Library window right away.
   *   3. Re-open the Library the way a Dock click does (macOS `activate`).
   *
   * Expected:
   *   - The app keeps running with no Library window after the close.
   *   - The reopened Library lists one card whose text is
   *     "Window text survives close" (read back from main, not from cache).
   *
   * Notes:
   *   - macOS only: other platforms quit when the last window closes.
   */
  test('typing then closing the window inside 500 ms keeps the tail; activate reopens it', async () => {
    test.skip(process.platform !== 'darwin', 'closing the last window quits elsewhere');
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await createNote(handles, 'Window text');

      await library.typeIntoEditor(' survives close');
      const closed = handles.library.waitForEvent('close');
      await handles.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes('view=library'))
          ?.close();
      });
      await closed;

      await handles.app.evaluate(({ app }) => {
        app.emit('activate');
      });
      const reopened = new LibraryPage(await waitForWindowByView(handles.app, 'library'));
      await expect(reopened.cards()).toHaveCount(1);
      await expect(reopened.cards().first()).toContainText('Window text survives close');
      expect(await storedBodies(reopened)).toEqual(['Window text survives close']);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario ⌘↵ in the Library editor saves at once, without a blank line or a new note
   * @area Library
   * @feature Autosave / ⌘↵ (bug #06)
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Create a note "Seed" and wait until it is stored.
   *   2. Freeze the page clock so the 500 ms debounce timer can never fire.
   *   3. Type " more" and press ⌘↵.
   *
   * Expected:
   *   - Main stores "Seed more" although the debounce never elapsed, i.e.
   *     ⌘↵ flushed synchronously.
   *   - The editor text is exactly "Seed more" (no inserted blank line).
   *   - Still one card and one stored note (⌘↵ does not promote or create).
   */
  test('⌘↵ flushes immediately, adds no blank line and creates no note', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await createNote(handles, 'Seed');

      // With time frozen the autosave timer is inert, so only ⌘↵ can have
      // written the text: no reliance on beating a 500 ms deadline.
      await handles.library.clock.install();
      await handles.library.clock.pauseAt(Date.now() + 60_000);

      await library.typeIntoEditor(' more');
      await handles.library.keyboard.press('Meta+Enter');

      await expect.poll(() => storedBodies(library)).toEqual(['Seed more']);
      expect(await library.editorText()).toBe('Seed more');
      await expect(library.cards()).toHaveCount(1);
    } finally {
      await handles.dispose();
    }
  });
});
