import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';
import { LibraryPage } from '../helpers/library';

/**
 * Cross-window contract between Draft and Library.
 *
 *   - happy path: ⌘↵ promotes and Library refreshes via notes:changed
 *   - validation: empty / whitespace drafts are NOT promoted
 *   - races: promote while a Library autosave is in flight; promote while a
 *     filter is applied; multiple promotes in rapid succession
 *   - state invariants: after promote, the scratch buffer is empty
 */
test.describe('Draft → Library promote', () => {
  /**
   * @scenario ⌘↵ in Draft creates a Library note and clears the scratch buffer
   * @area Cross-window
   * @feature Promote
   * @type positive
   * @priority P0
   *
   * Steps:
   *   1. Verify Library is empty.
   *   2. Summon Draft, type "# Promoted heading\nbody line", press ⌘↵.
   *   3. Re-summon Draft and inspect the editor contents.
   *
   * Expected:
   *   - Library now has 1 card containing "Promoted heading".
   *   - On re-summon, the editor does NOT contain "Promoted heading" or "body line".
   */
  test('⌘↵ in Draft creates a Library note and clears the scratch buffer', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await expect(library.cards()).toHaveCount(0);

      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('# Promoted heading\nbody line');
      await draft.raw.waitForTimeout(300);
      await draft.submit();

      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('Promoted heading');

      const draft2 = await DraftPage.summon(handles.app);
      const text = (await draft2.editor().textContent()) ?? '';
      expect(text).not.toContain('Promoted heading');
      expect(text).not.toContain('body line');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Empty Draft on ⌘↵ does not create a Library note
   * @area Cross-window
   * @feature Promote / Validation
   * @type negative
   * @priority P0
   *
   * Steps:
   *   1. Summon Draft.
   *   2. Without typing anything, press ⌘↵.
   *
   * Expected:
   *   - Library still has 0 cards.
   */
  test('empty Draft on ⌘↵ does not create a Library note', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      const draft = await DraftPage.summon(handles.app);
      await draft.submit();
      await handles.library.waitForTimeout(500);
      await expect(library.cards()).toHaveCount(0);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Whitespace-only Draft on ⌘↵ does not create a Library note
   * @area Cross-window
   * @feature Promote / Validation
   * @type negative
   * @priority P1
   *
   * Steps:
   *   1. Summon Draft.
   *   2. Type whitespace + tabs + newlines, wait past autosave, press ⌘↵.
   *
   * Expected:
   *   - Library still has 0 cards.
   */
  test('whitespace-only Draft on ⌘↵ does not create a Library note', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('   \n\t\t  \n   ');
      await draft.raw.waitForTimeout(600);
      await draft.submit();
      await handles.library.waitForTimeout(500);
      await expect(library.cards()).toHaveCount(0);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Promote preserves multi-line markdown body (headings, lists, blockquote)
   * @area Cross-window
   * @feature Promote / Markdown
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Summon Draft.
   *   2. Paste a markdown body with heading, bullets and a blockquote.
   *   3. Press ⌘↵.
   *   4. Click the new card; wait for the editor text.
   *
   * Expected:
   *   - Editor contains the heading, a bullet item, and the blockquote text.
   */
  test('promote with multi-line markdown content preserves the full body', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      const draft = await DraftPage.summon(handles.app);
      const body = [
        '# Meeting notes',
        '',
        '- discussed scope',
        '- assigned owners',
        '',
        '> follow up next Wednesday',
      ].join('\n');
      await draft.setEditorContent(body);
      await draft.raw.waitForTimeout(600);
      await draft.submit();

      await expect(library.cards()).toHaveCount(1);
      await library.cards().first().click();
      await library.waitForEditorText('Meeting notes');
      const text = await library.editorText();
      expect(text).toContain('discussed scope');
      expect(text).toContain('follow up next Wednesday');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Three back-to-back promotes create three distinct Library notes in newest-first order
   * @area Cross-window
   * @feature Promote / Race
   * @type race
   * @priority P1
   *
   * Steps:
   *   1. Loop 3 times: summon, type a unique body, ⌘↵.
   *
   * Expected:
   *   - 3 cards present; the newest promote is on top, oldest at the bottom.
   */
  test('promote three times in a row creates three distinct Library notes', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      for (const body of ['first promote', 'second promote', 'third promote']) {
        const draft = await DraftPage.summon(handles.app);
        await draft.typeIntoEditor(body);
        await draft.raw.waitForTimeout(400);
        await draft.submit();
        await handles.library.waitForTimeout(400);
      }

      await library.waitForCardCount(3);
      const titles = await library.cardTitles();
      expect(titles[0]).toContain('third');
      expect(titles[1]).toContain('second');
      expect(titles[2]).toContain('first');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Promote while Library is filtered to "Pinned": note is created but not visible until filter is removed
   * @area Cross-window
   * @feature Promote / Filter composition
   * @type race
   * @priority P1
   *
   * Steps:
   *   1. Seed a pinned note "seed pinned".
   *   2. Switch sidebar filter to "Закреплённые" → 1 card.
   *   3. Summon Draft, type "promoted while filtered", ⌘↵.
   *   4. Switch filter back to "Все заметки".
   *
   * Expected:
   *   - With Pinned filter active: still 1 card (the promoted note is unpinned).
   *   - With All filter active: 2 cards. Pinned-first order: seed first,
   *     promoted second.
   */
  test('promote while the Library is filtered to Pinned still creates the note (visible after switching back)', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('seed pinned');
      await handles.library.waitForTimeout(800);
      await library.clickPin();

      await library.selectFilter('Закреплённые');
      await expect(library.cards()).toHaveCount(1);

      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('promoted while filtered');
      await draft.raw.waitForTimeout(400);
      await draft.submit();
      await handles.library.waitForTimeout(500);

      await expect(library.cards()).toHaveCount(1);

      await library.selectFilter('Все заметки');
      await expect(library.cards()).toHaveCount(2);
      const titles = await library.cardTitles();
      expect(titles[0]).toContain('seed pinned');
      expect(titles[1]).toContain('promoted while filtered');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Promote while Library has an active search: card is added to the dataset
   * @area Cross-window
   * @feature Promote / Search composition
   * @type race
   * @priority P1
   *
   * Steps:
   *   1. Seed "apple seed" and apply search "apple" → 1 card.
   *   2. Promote a Draft with body "promoted-banana".
   *   3. While search is still "apple": cards count stays 1.
   *   4. Change query to "banana" → 1 card containing "promoted-banana".
   *
   * Expected:
   *   - Promoted note enters the dataset and is searchable.
   */
  test('promote while the Library is in a search view sends the note into the dataset', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('apple seed');
      await handles.library.waitForTimeout(800);

      await library.typeSearch('apple');
      await expect(library.cards()).toHaveCount(1);

      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('promoted-banana');
      await draft.raw.waitForTimeout(400);
      await draft.submit();
      await handles.library.waitForTimeout(500);

      await expect(library.cards()).toHaveCount(1);

      await library.typeSearch('banana');
      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('promoted-banana');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario After promote → Esc, the scratch buffer is empty and no duplicate note is created
   * @area Cross-window
   * @feature Promote / Buffer cleanup
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Summon, type "once and done", ⌘↵.
   *   2. Re-summon, read editor text, press Esc, hide.
   *
   * Expected:
   *   - On re-summon, the editor does NOT contain "once and done".
   *   - Library still has exactly 1 card.
   */
  test('promote then Esc — buffer is empty AND no duplicate note is created', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('once and done');
      await draft.raw.waitForTimeout(400);
      await draft.submit();
      await handles.library.waitForTimeout(400);
      await expect(library.cards()).toHaveCount(1);

      const draft2 = await DraftPage.summon(handles.app);
      const text = await draft2.editorText();
      expect(text).not.toContain('once and done');
      await draft2.cancel();
      await DraftPage.hide(handles.app);
      await handles.library.waitForTimeout(400);

      await expect(library.cards()).toHaveCount(1);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Library editor selection survives a Draft promote landing in the list
   * @area Cross-window
   * @feature Promote / Selection stability
   * @type race
   * @priority P0
   *
   * Steps:
   *   1. In Library: ⌘N, type "working on this", wait for the card title.
   *   2. Summon Draft, type "arrives from draft", ⌘↵.
   *
   * Expected:
   *   - Library shows 2 cards.
   *   - Library editor still shows "working on this".
   *   - The card with `aria-current="true"` contains "working on this".
   */
  test('Library editor open while Draft promotes: list refreshes without losing the active selection', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('working on this');
      await library.waitForCardTitle('working on this');

      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('arrives from draft');
      await draft.raw.waitForTimeout(400);
      await draft.submit();
      await handles.library.waitForTimeout(500);

      await expect(library.cards()).toHaveCount(2);
      const editorText = await library.editorText();
      expect(editorText).toContain('working on this');
      await expect(
        handles.library.locator('[data-testid^="note-card-"][aria-current="true"]'),
      ).toContainText('working on this');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Promoted note's title is derived from the first line of the body
   * @area Cross-window
   * @feature Promote / Title derivation
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Summon Draft.
   *   2. Paste "Quick title\nbody body body".
   *   3. ⌘↵.
   *
   * Expected:
   *   - 1 card; title contains "Quick title".
   *   - Title does NOT contain "body body".
   */
  test('promote returns a note whose title is derived from the first line of the body', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      const draft = await DraftPage.summon(handles.app);
      await draft.setEditorContent('Quick title\nbody body body');
      await draft.raw.waitForTimeout(400);
      await draft.submit();
      await expect(library.cards()).toHaveCount(1);
      const titles = await library.cardTitles();
      expect(titles[0]).toContain('Quick title');
      expect(titles[0]).not.toContain('body body');
    } finally {
      await handles.dispose();
    }
  });
});
