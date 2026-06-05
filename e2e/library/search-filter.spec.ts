import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { LibraryPage } from '../helpers/library';

test.describe('Library search and filters', () => {
  test('⌘F focuses the search input', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await library.pressSearchShortcut();
      // Active element after the shortcut should be the search input.
      const focused = await handles.library.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? null,
      );
      expect(focused).toBe('Search');
    } finally {
      await handles.dispose();
    }
  });

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
      // Highlight `<mark>` is inserted around the matched substring.
      await expect(handles.library.locator('.lib-hl').first()).toContainText(/coffee/i);
    } finally {
      await handles.dispose();
    }
  });

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
      // The newest note is currently selected — pin it.
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
});
