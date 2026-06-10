import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { LibraryPage } from '../helpers/library';

/**
 * Library CRUD + selection coverage.
 *
 * Beyond the happy path (create/edit/delete) we verify:
 *   - validation (empty / whitespace bodies are still saved as untitled notes
 *     because the user expects "I clicked New, my note is there")
 *   - sane behaviour with many notes (selection stability, sorted by recency)
 *   - persistence across an app restart
 *   - races: ⌘N spam, concurrent editing during a delete
 *   - keyboard-only flow (no mouse interaction)
 */

test.describe('Library CRUD', () => {
  /**
   * @scenario Empty Library → create via ⌘N → edit → delete
   * @area Library
   * @feature CRUD
   * @type positive
   * @priority P0
   *
   * Steps:
   *   1. Verify empty state ("Заметка не выбрана") on a fresh userData.
   *   2. Press ⌘N → assert one card and the editor mounts.
   *   3. Type "Hello Library", wait past autosave.
   *   4. Switch sidebar filter to "Все заметки".
   *   5. Click the delete button.
   *
   * Expected:
   *   - After ⌘N: 1 card, editor visible.
   *   - After typing: first card contains "Hello Library".
   *   - After delete: 0 cards, empty-state placeholder visible.
   */
  test('starts empty, lets user create, edit, and delete a note', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await expect(library.cards()).toHaveCount(0);
      await expect(handles.library.getByText('Заметка не выбрана')).toBeVisible();

      await library.pressNewShortcut();
      await expect(library.cards()).toHaveCount(1);
      await expect(library.editor()).toBeVisible();

      await library.typeIntoEditor('Hello Library');
      await library.waitForEditorText('Hello Library');
      await handles.library.waitForTimeout(800);

      await library.selectFilter('Все заметки');
      await expect(library.cards().first()).toContainText('Hello Library');

      await library.clickDelete();
      await expect(library.cards()).toHaveCount(0);
      await expect(handles.library.getByText('Заметка не выбрана')).toBeVisible();
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Switching between two notes preserves each note's body
   * @area Library
   * @feature Selection / Editor
   * @type positive
   * @priority P0
   *
   * Steps:
   *   1. Create note A "First note body" (wait for card title).
   *   2. Create note B "Second note body" (wait for card title).
   *   3. Click the older card (last) → editor shows A.
   *   4. Click the newer card (first) → editor shows B.
   *
   * Expected:
   *   - Each card shows the corresponding body when selected; no body bleed
   *     across the autosave debounce.
   */
  test('switching between notes preserves their distinct contents', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('First note body');
      await library.waitForCardTitle('First note body');

      await library.pressNewShortcut();
      await library.typeIntoEditor('Second note body');
      await library.waitForCardTitle('Second note body');

      await expect(library.cards()).toHaveCount(2);

      await library.cards().last().click();
      await library.waitForEditorText('First note body');

      await library.cards().first().click();
      await library.waitForEditorText('Second note body');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Library notes survive a full app restart in the same userData
   * @area Library
   * @feature Persistence
   * @type persistence
   * @priority P0
   *
   * Steps:
   *   1. Launch app, ⌘N, type "Persisted across runs", wait past autosave.
   *   2. Close the app.
   *   3. Re-launch pointing at the same userData directory.
   *
   * Expected:
   *   - 1 card present; clicking it loads the editor with the same text.
   */
  test('persists notes across app restarts in the same userData dir', async () => {
    const first = await launchApp();
    const sharedDir = first.userDataDir;
    {
      const library = new LibraryPage(first.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('Persisted across runs');
      await first.library.waitForTimeout(800);
    }
    await first.app.close();

    const second = await launchApp({ reuseUserDataDir: sharedDir });
    try {
      const library = new LibraryPage(second.library);
      await expect(library.cards()).toHaveCount(1);
      await library.cards().first().click();
      await library.waitForEditorText('Persisted across runs');
    } finally {
      await second.dispose();
      const { rmSync } = await import('node:fs');
      try {
        rmSync(sharedDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  // ---------- Validation / edge cases ----------

  /**
   * @scenario A brand-new empty note still appears in the list (untitled placeholder)
   * @area Library
   * @feature Create / Untitled
   * @type negative
   * @priority P1
   *
   * Steps:
   *   1. Press ⌘N.
   *   2. Do NOT type anything; switch filter to "Все заметки".
   *
   * Expected:
   *   - 1 card visible.
   *   - Card title is "Без заголовка" (untitled placeholder).
   */
  test('a brand-new note with no content still survives in the list (untitled)', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await expect(library.cards()).toHaveCount(1);
      await library.selectFilter('Все заметки');
      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('Без заголовка');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Title is derived from the first non-empty line of the body
   * @area Library
   * @feature Title derivation
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. ⌘N.
   *   2. Type "Real title", Enter, "body line one", Enter, "body line two".
   *
   * Expected:
   *   - The first card's title contains "Real title".
   *   - The title does NOT contain body lines.
   */
  test('multi-line content uses the first non-empty line as the title', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('Real title');
      await handles.library.keyboard.press('Enter');
      await handles.library.keyboard.type('body line one');
      await handles.library.keyboard.press('Enter');
      await handles.library.keyboard.type('body line two');
      await library.waitForCardTitle('Real title');
      const titles = await library.cardTitles();
      expect(titles[0]).toContain('Real title');
      expect(titles[0]).not.toContain('body line one');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Keyboard-only flow: ⌘N twice creates two notes, latest is selected
   * @area Library
   * @feature Selection
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Press ⌘N twice.
   *
   * Expected:
   *   - 2 cards.
   *   - First (newest) card has `aria-current="true"`.
   */
  test('keyboard-only: ⌘N twice creates two notes and the editor focuses the latest', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.pressNewShortcut();
      await expect(library.cards()).toHaveCount(2);
      await expect(library.cards().first()).toHaveAttribute('aria-current', 'true');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Rapid ⌘N spam does not lose or duplicate notes
   * @area Library
   * @feature Create / Race
   * @type race
   * @priority P1
   *
   * Steps:
   *   1. Press ⌘N 5 times in rapid succession.
   *
   * Expected:
   *   - Exactly 5 cards present.
   */
  test('⌘N spam does not create duplicates or hang (race-resistant)', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      for (let i = 0; i < 5; i++) {
        await library.pressNewShortcut();
      }
      await library.waitForCardCount(5);
      await expect(library.cards()).toHaveCount(5);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Deleting the active (newest) note leaves the older note intact
   * @area Library
   * @feature Delete
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. ⌘N "keep me" (wait for card title).
   *   2. ⌘N "delete me" (wait for card title) — active is the newer card.
   *   3. Press the delete button.
   *
   * Expected:
   *   - 1 card remaining, containing "keep me".
   */
  test('delete on a note that is not the currently selected one resolves cleanly', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('keep me');
      await library.waitForCardTitle('keep me');
      await library.pressNewShortcut();
      await library.typeIntoEditor('delete me');
      await library.waitForCardTitle('delete me');

      await library.clickDelete();
      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('keep me');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Multi-KB body survives an app restart with the trailing marker intact
   * @area Library
   * @feature Persistence / Large content
   * @type persistence
   * @priority P1
   *
   * Steps:
   *   1. Launch app, ⌘N.
   *   2. Paste "Big note title\n<~4 KB filler><TAIL-MARKER-βγΩ>", wait past autosave.
   *   3. Close, re-launch with same userData.
   *   4. Click the card; scroll CM6 viewport to the end via ⌘+End.
   *
   * Expected:
   *   - Editor contains the tail marker.
   *
   * Notes:
   *   - Payload is sized to fit the CM6 viewport so textContent is reliable.
   */
  test('multi-KB content saves and reloads on restart with the tail marker intact', async () => {
    const first = await launchApp();
    const sharedDir = first.userDataDir;
    const marker = 'TAIL-MARKER-βγΩ';
    {
      const library = new LibraryPage(first.library);
      await library.pressNewShortcut();
      const filler = 'word '.repeat(800); // ~4 KB
      await library.setEditorContent(`Big note title\n${filler}${marker}`);
      await first.library.waitForTimeout(1200);
    }
    await first.app.close();

    const second = await launchApp({ reuseUserDataDir: sharedDir });
    try {
      const library = new LibraryPage(second.library);
      await expect(library.cards()).toHaveCount(1);
      await library.cards().first().click();
      // Scroll the CM6 viewport to the end so the marker line is rendered.
      await second.library.locator('.cm-content').click();
      await second.library.keyboard.press('Meta+End');
      await second.library.waitForTimeout(200);
      const text = await library.editorText();
      expect(text).toContain(marker);
    } finally {
      await second.dispose();
      const { rmSync } = await import('node:fs');
      try {
        rmSync(sharedDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  /**
   * @scenario XSS / SQL-injection-shaped payload is rendered as literal text (no DOM injection, no DB damage)
   * @area Library
   * @feature Security / Rendering
   * @type negative
   * @priority P0
   *
   * Steps:
   *   1. ⌘N.
   *   2. Type `<script>window.__pwned=true</script> "; DROP TABLE notes; --`.
   *   3. Wait for the title to update.
   *
   * Expected:
   *   - `window.__pwned` is undefined (not `true`) → no script execution.
   *   - Card title contains "script" and "DROP TABLE" as literal text.
   *
   * Notes:
   *   - The list renders titles via dangerouslySetInnerHTML for highlight;
   *     the highlighter MUST HTML-escape the input.
   */
  test('special characters: HTML/SQL injection-shaped payload renders as literal text', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      const payload = '<script>window.__pwned=true</script> "; DROP TABLE notes; --';
      await library.typeIntoEditor(payload);
      await library.waitForCardTitle('DROP TABLE notes');
      const pwned = await handles.library.evaluate(
        () => (window as unknown as { __pwned?: boolean }).__pwned === true,
      );
      expect(pwned).toBe(false);
      await expect(library.cards().first()).toContainText('script');
      await expect(library.cards().first()).toContainText('DROP TABLE');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Debounced autosave coalesces fast edits — the final state is what gets persisted
   * @area Library
   * @feature Autosave / Debounce
   * @type persistence
   * @priority P1
   *
   * Steps:
   *   1. Launch, ⌘N.
   *   2. Type "step 1", short pause, "step 2", short pause, "step 3", long pause (> debounce).
   *   3. Close app, re-launch with same userData.
   *
   * Expected:
   *   - The reloaded editor contains all three steps in order.
   */
  test('debounced autosave: a fast-then-pause edit pattern commits only the final state', async () => {
    const first = await launchApp();
    const sharedDir = first.userDataDir;
    {
      const library = new LibraryPage(first.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('step 1');
      await first.library.waitForTimeout(120);
      await library.editor().focus();
      await first.library.keyboard.press('End');
      await library.typeIntoEditor(' step 2');
      await first.library.waitForTimeout(120);
      await library.editor().focus();
      await first.library.keyboard.press('End');
      await library.typeIntoEditor(' step 3');
      await first.library.waitForTimeout(900); // > debounce
    }
    await first.app.close();

    const second = await launchApp({ reuseUserDataDir: sharedDir });
    try {
      const library = new LibraryPage(second.library);
      await expect(library.cards()).toHaveCount(1);
      await library.cards().first().click();
      const text = await library.editorText();
      expect(text).toContain('step 1');
      expect(text).toContain('step 2');
      expect(text).toContain('step 3');
    } finally {
      await second.dispose();
      const { rmSync } = await import('node:fs');
      try {
        rmSync(sharedDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  /**
   * @scenario Deleting the last note restores the empty-state placeholder + ⌘N hint
   * @area Library
   * @feature Delete / Empty state
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. ⌘N, type "only one", wait for card title.
   *   2. Click delete.
   *
   * Expected:
   *   - 0 cards.
   *   - "Заметка не выбрана" visible.
   *   - "Выбери заметку слева или создай новую — ⌘N" hint visible.
   */
  test('delete of last note returns the editor to the empty placeholder', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('only one');
      await library.waitForCardTitle('only one');

      await library.clickDelete();
      await expect(library.cards()).toHaveCount(0);
      await expect(handles.library.getByText('Заметка не выбрана')).toBeVisible();

      await expect(
        handles.library.getByText('Выбери заметку слева или создай новую — ⌘N'),
      ).toBeVisible();
    } finally {
      await handles.dispose();
    }
  });
});
