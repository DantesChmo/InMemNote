import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { LibraryPage } from '../helpers/library';

/**
 * Search + filter coverage.
 *
 *   - happy path: live narrowing, highlight, empty-state copy
 *   - validation: whitespace queries, case-insensitivity, unicode
 *   - composition with the "pinned" sidebar filter
 *   - races: typing during an inflight search round-trip
 *   - escape resets state; clicking the (x) button also resets state
 *   - search runs across both title and body
 */
test.describe('Library search and filters', () => {
  /**
   * @scenario ⌘F focuses the Library search input
   * @area Library
   * @feature Search / Shortcut
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Press ⌘F.
   *
   * Expected:
   *   - `document.activeElement.aria-label === "Search"`.
   */
  test('⌘F focuses the search input', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressSearchShortcut();
      const focused = await handles.library.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? null,
      );
      expect(focused).toBe('Search');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Live search narrows the list to matching notes and highlights the hit
   * @area Library
   * @feature Search
   * @type positive
   * @priority P0
   *
   * Steps:
   *   1. Create three notes: "Buy coffee beans", "Vacation plans for July",
   *      "Coffee machine cleanup".
   *   2. Type "coffee" into the search field.
   *
   * Expected:
   *   - Exactly 2 cards visible.
   *   - First `.lib-hl` mark contains the substring "coffee" (case-insensitive).
   */
  test('live-search narrows the list to matching notes and highlights the hit', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('Buy coffee beans');
      await handles.library.waitForTimeout(800);

      await library.pressNewShortcut();
      await library.typeIntoEditor('Vacation plans for July');
      await handles.library.waitForTimeout(800);

      await library.pressNewShortcut();
      await library.typeIntoEditor('Coffee machine cleanup');
      await handles.library.waitForTimeout(800);

      await library.typeSearch('coffee');

      await expect(library.cards()).toHaveCount(2);
      await expect(handles.library.locator('.lib-hl').first()).toContainText(/coffee/i);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Esc in the search field clears the query and restores the full list
   * @area Library
   * @feature Search / Reset
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Create two notes ("alpha", "beta").
   *   2. Type a no-match query "zzz no match".
   *   3. Press Esc in the search field.
   *
   * Expected:
   *   - During no-match: 0 cards + "Запрос «...» ничего не нашёл" copy.
   *   - After Esc: full list (2 cards) restored.
   */
  test('Esc clears the search and restores the full list', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('alpha');
      await handles.library.waitForTimeout(800);
      await library.pressNewShortcut();
      await library.typeIntoEditor('beta');
      await handles.library.waitForTimeout(800);

      await library.typeSearch('zzz no match');
      await expect(library.cards()).toHaveCount(0);
      await expect(handles.library.getByText(/ничего не нашёл/i)).toBeVisible();

      await library.clearSearch();
      await expect(library.cards()).toHaveCount(2);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario "Pinned" filter shows only pinned notes
   * @area Library
   * @feature Filter
   * @type positive
   * @priority P0
   *
   * Steps:
   *   1. Create "plain note" (unpinned) and "important note" (pin it).
   *   2. Click sidebar filter "Закреплённые".
   *   3. Click sidebar filter "Все заметки".
   *
   * Expected:
   *   - In pinned mode: 1 card ("important note").
   *   - In all mode: 2 cards.
   */
  test('Pinned filter shows only pinned notes', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('plain note');
      await handles.library.waitForTimeout(800);

      await library.pressNewShortcut();
      await library.typeIntoEditor('important note');
      await handles.library.waitForTimeout(800);
      await library.clickPin();

      await library.selectFilter('Закреплённые');
      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('important note');

      await library.selectFilter('Все заметки');
      await expect(library.cards()).toHaveCount(2);
    } finally {
      await handles.dispose();
    }
  });

  // ---------- Validation / edge cases ----------

  /**
   * @scenario Search is case-insensitive (upper-case query hits lower-case content)
   * @area Library
   * @feature Search / Case-insensitivity
   * @type edge
   * @priority P1
   *
   * Steps:
   *   1. Create note "Buy coffee beans".
   *   2. Search "BEANS".
   *
   * Expected:
   *   - 1 card; highlight mark contains "beans".
   */
  test('case-insensitive match: "BEANS" hits a card containing "beans"', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('Buy coffee beans');
      await handles.library.waitForTimeout(800);

      await library.typeSearch('BEANS');
      await expect(library.cards()).toHaveCount(1);
      await expect(handles.library.locator('.lib-hl').first()).toContainText(/beans/i);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Whitespace-only query is treated as no query (full list)
   * @area Library
   * @feature Search / Validation
   * @type negative
   * @priority P1
   *
   * Steps:
   *   1. Create two notes ("first", "second").
   *   2. Type 5 spaces into the search field.
   *
   * Expected:
   *   - Full list visible (2 cards).
   */
  test('whitespace-only query is equivalent to no query (full list)', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('first');
      await handles.library.waitForTimeout(800);
      await library.pressNewShortcut();
      await library.typeIntoEditor('second');
      await handles.library.waitForTimeout(800);

      await library.typeSearch('     ');
      await expect(library.cards()).toHaveCount(2);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Search matches the BODY of a note, not only the title
   * @area Library
   * @feature Search / Body match
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Create "Daily standup\ndiscussed blockers and shipped a fix" and "other".
   *   2. Search "blockers".
   *
   * Expected:
   *   - 1 card returned, containing "Daily standup".
   */
  test('search matches the BODY of a note, not only the title', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('Daily standup');
      await handles.library.keyboard.press('Enter');
      await library.typeIntoEditor('discussed blockers and shipped a fix');
      await handles.library.waitForTimeout(800);

      await library.pressNewShortcut();
      await library.typeIntoEditor('other');
      await handles.library.waitForTimeout(800);

      await library.typeSearch('blockers');
      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('Daily standup');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Cyrillic search query matches Cyrillic content
   * @area Library
   * @feature Search / Unicode
   * @type edge
   * @priority P1
   *
   * Steps:
   *   1. Create "Список покупок: молоко, хлеб" and "Гулять в парке".
   *   2. Search "хлеб".
   *
   * Expected:
   *   - 1 card returned, containing "молоко".
   */
  test('unicode query (Cyrillic) hits Cyrillic content', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('Список покупок: молоко, хлеб');
      await handles.library.waitForTimeout(800);

      await library.pressNewShortcut();
      await library.typeIntoEditor('Гулять в парке');
      await handles.library.waitForTimeout(800);

      await library.typeSearch('хлеб');
      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('молоко');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Rapid keystrokes converge on the final query (no stale result)
   * @area Library
   * @feature Search / Race
   * @type race
   * @priority P1
   *
   * Steps:
   *   1. Create three notes whose titles share no common prefix
   *      ("zebra crossing", "mango sticky rice", "octopus party").
   *   2. Type "zebra" into the search field as a fast keystroke burst.
   *
   * Expected:
   *   - 1 card containing "zebra" is the final stable list.
   *
   * Notes:
   *   - Words intentionally have no shared prefix so a stale intermediate
   *     response is distinguishable from the correct final one.
   */
  test('typing rapidly through several keystrokes converges on the final query', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('zebra crossing');
      await handles.library.waitForTimeout(800);
      await library.pressNewShortcut();
      await library.typeIntoEditor('mango sticky rice');
      await handles.library.waitForTimeout(800);
      await library.pressNewShortcut();
      await library.typeIntoEditor('octopus party');
      await handles.library.waitForTimeout(800);

      const input = handles.library.getByRole('textbox', { name: 'Search' });
      await input.click();
      await handles.library.keyboard.type('zebra');

      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('zebra');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Active search overrides the sidebar filter (search hits all notes)
   * @area Library
   * @feature Search / Filter composition
   * @type edge
   * @priority P1
   *
   * Steps:
   *   1. Create "alpha pinned" (pinned) and "alpha plain".
   *   2. Switch filter to "Закреплённые" → 1 card.
   *   3. Type "alpha" into search.
   *
   * Expected:
   *   - With search active: 2 cards (search bypasses the pinned filter).
   */
  test('search + Pinned filter compose: search is applied to all notes regardless of filter', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('alpha pinned');
      await handles.library.waitForTimeout(800);
      await library.clickPin();

      await library.pressNewShortcut();
      await library.typeIntoEditor('alpha plain');
      await handles.library.waitForTimeout(800);

      await library.selectFilter('Закреплённые');
      await expect(library.cards()).toHaveCount(1);

      await library.typeSearch('alpha');
      await expect(library.cards()).toHaveCount(2);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Clearing search restores the previously selected sidebar filter
   * @area Library
   * @feature Search / Filter composition
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Create "one" (pinned) and "two" (unpinned).
   *   2. Switch filter to "Закреплённые" → 1 card.
   *   3. Type "two" → 1 card "two" (search overrides filter).
   *   4. Press Esc in search.
   *
   * Expected:
   *   - 1 card visible after Esc, containing "one" (filter back in effect).
   */
  test('clearing query restores the list to the previously-selected filter', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      await library.pressNewShortcut();
      await library.typeIntoEditor('one');
      await handles.library.waitForTimeout(800);
      await library.clickPin();

      await library.pressNewShortcut();
      await library.typeIntoEditor('two');
      await handles.library.waitForTimeout(800);

      await library.selectFilter('Закреплённые');
      await expect(library.cards()).toHaveCount(1);

      await library.typeSearch('two');
      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('two');

      await library.clearSearch();
      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('one');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Zero-result query renders the "queryNoMatch" copy with the literal query in quotes
   * @area Library
   * @feature Search / Empty state
   * @type negative
   * @priority P2
   *
   * Steps:
   *   1. Create "alpha".
   *   2. Search "zebra".
   *
   * Expected:
   *   - 0 cards.
   *   - Body contains the literal "«zebra»".
   */
  test('zero results renders the "queryNoMatch" copy with the actual query string', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('alpha');
      await handles.library.waitForTimeout(800);

      await library.typeSearch('zebra');
      await expect(library.cards()).toHaveCount(0);
      await expect(handles.library.getByText(/«zebra»/)).toBeVisible();
    } finally {
      await handles.dispose();
    }
  });
});
