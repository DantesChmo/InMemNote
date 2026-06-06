import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { LibraryPage } from '../helpers/library';

test.describe('Library CRUD', () => {
  test('starts empty, lets user create, edit, and delete a note', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      // Fresh userData: the list should be empty and the editor in its
      // "no note selected" placeholder.
      await expect(library.cards()).toHaveCount(0);
      await expect(handles.library.getByText('Заметка не выбрана')).toBeVisible();

      // Create via ⌘N → one card appears and the editor mounts.
      await library.pressNewShortcut();
      await expect(library.cards()).toHaveCount(1);
      await expect(library.editor()).toBeVisible();

      // Type content and wait past the 500ms autosave debounce. Then close
      // and reopen to confirm the note was persisted across launches.
      await library.typeIntoEditor('Hello Library');
      await library.waitForEditorText('Hello Library');
      await handles.library.waitForTimeout(800);

      // Trigger a sidebar nav to force a fresh fetchNotes — the saved title
      // should now be derived from "Hello Library".
      await library.selectFilter('Все заметки');
      await expect(library.cards().first()).toContainText('Hello Library');

      // Delete the current note via the editor's danger button.
      await library.clickDelete();
      await expect(library.cards()).toHaveCount(0);
      await expect(handles.library.getByText('Заметка не выбрана')).toBeVisible();
    } finally {
      await handles.dispose();
    }
  });

  test('switching between notes preserves their distinct contents', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);

      // Note 1. We wait for the title to surface in the card instead of a
      // fixed timeout — that's the observable signal that the autosave has
      // round-tripped through main and back into Redux.
      await library.pressNewShortcut();
      await library.typeIntoEditor('First note body');
      await library.waitForCardTitle('First note body');

      // Note 2.
      await library.pressNewShortcut();
      await library.typeIntoEditor('Second note body');
      await library.waitForCardTitle('Second note body');

      await expect(library.cards()).toHaveCount(2);

      // Click the older card (last in the list) and confirm its body is shown.
      await library.cards().last().click();
      await library.waitForEditorText('First note body');

      // Hop back to the newer note.
      await library.cards().first().click();
      await library.waitForEditorText('Second note body');
    } finally {
      await handles.dispose();
    }
  });

  test('persists notes across app restarts in the same userData dir', async () => {
    // First launch — create and persist a note.
    const first = await launchApp();
    const sharedDir = first.userDataDir;
    {
      const library = new LibraryPage(first.library);
      await library.pressNewShortcut();
      await library.typeIntoEditor('Persisted across runs');
      // Wait past autosave so SQLite has the row.
      await first.library.waitForTimeout(800);
    }
    await first.app.close();

    // Second launch — same userData dir; SQLite should hand the note back.
    const second = await launchApp({ reuseUserDataDir: sharedDir });
    try {
      const library = new LibraryPage(second.library);
      await expect(library.cards()).toHaveCount(1);
      await library.cards().first().click();
      await library.waitForEditorText('Persisted across runs');
    } finally {
      await second.dispose();
      // Now we manually clean up the dir we owned via the first launch.
      const { rmSync } = await import('node:fs');
      try {
        rmSync(sharedDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});
