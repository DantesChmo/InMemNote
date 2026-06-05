import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';
import { LibraryPage } from '../helpers/library';

test.describe('Draft → Library promote', () => {
  test('⌘↵ in Draft creates a Library note and clears the scratch buffer', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      await expect(library.cards()).toHaveCount(0);

      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('# Promoted heading\nbody line');
      await draft.raw.waitForTimeout(300); // a small flush so editor state is committed
      await draft.submit();

      // The promote handler emits `notes:changed`; the Library window's
      // subscription refetches and renders the new card.
      await expect(library.cards()).toHaveCount(1);
      await expect(library.cards().first()).toContainText('Promoted heading');

      // Re-summon: the scratch buffer should be empty after promote.
      // We assert the previous content is GONE rather than comparing against
      // an empty string — CodeMirror renders a placeholder span inside
      // `.cm-content` when the doc is empty, which leaks into `textContent`.
      const draft2 = await DraftPage.summon(handles.app);
      const text = (await draft2.editor().textContent()) ?? '';
      expect(text).not.toContain('Promoted heading');
      expect(text).not.toContain('body line');
    } finally {
      await handles.dispose();
    }
  });

  test('empty Draft on ⌘↵ does not create a Library note', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      const draft = await DraftPage.summon(handles.app);
      await draft.submit();

      // Wait for any IPC ripples and assert nothing landed in Library.
      await handles.library.waitForTimeout(500);
      await expect(library.cards()).toHaveCount(0);
    } finally {
      await handles.dispose();
    }
  });
});
