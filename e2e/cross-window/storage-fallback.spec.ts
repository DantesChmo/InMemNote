import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';
import { LibraryPage, restartApp } from '../helpers/library';

/**
 * Storage fallback is never silent (bug #03, docs/TZ.md §2.5, ADR 0008).
 *
 * When SQLite cannot be opened the app boots against in-memory stores, which
 * lose everything on quit. Library must say so with a banner (no dismiss
 * button, with the reason) and Draft with a one-line strip in both its full
 * and pinned layouts. A healthy launch shows neither.
 *
 * The broken database is produced by putting a *directory* where
 * `inmemnote.db` should be: better-sqlite3 cannot open it, on any user and
 * any CI runner (a `chmod 000` file would still open as root).
 */

/** Provision a userData dir whose `inmemnote.db` is an unopenable directory. */
function brokenUserDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'inmemnote-e2e-broken-'));
  mkdirSync(join(dir, 'inmemnote.db'));
  return dir;
}

/** What main answers to `storage:status` in the given window. */
async function storageStatus(page: Page): Promise<unknown> {
  return page.evaluate(() =>
    (
      window as unknown as { inmemnote: { storage: { status: () => Promise<unknown> } } }
    ).inmemnote.storage.status(),
  );
}

test.describe('Storage fallback', () => {
  /**
   * @scenario Healthy launch shows no storage warning in Library or Draft
   * @area Cross-window
   * @feature Storage fallback (bug #03)
   * @type negative
   * @priority P0
   *
   * Steps:
   *   1. Launch on a fresh userData dir.
   *   2. Summon Draft, then pin it.
   *
   * Expected:
   *   - No "not saved" banner in Library.
   *   - No "not saved" strip in Draft, unpinned or pinned.
   */
  test('a healthy launch shows no storage warning anywhere', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      // Main reports nothing degraded. The renderer's own boot-time
      // `storage:status` call was sent earlier on the same channel, so once
      // this reply is back that call has been answered too and the absence
      // of the banner below is a real "no", not "not asked yet".
      await expect(handles.library.getByText('Заметка не выбрана')).toBeVisible();
      expect(await storageStatus(handles.library)).toEqual({ degraded: [] });
      await expect(library.storageBanner()).toHaveCount(0);

      const draft = await DraftPage.summon(handles.app);
      await expect(draft.editor()).toBeVisible();
      expect(await storageStatus(draft.raw)).toEqual({ degraded: [] });
      await expect(draft.storageStrip()).toHaveCount(0);
      await draft.clickPin();
      await expect(draft.storageStrip()).toHaveCount(0);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Unopenable database: Library shows a non-dismissable banner with the reason
   * @area Cross-window
   * @feature Storage fallback (bug #03)
   * @type negative
   * @priority P0
   *
   * Steps:
   *   1. Replace `userData/inmemnote.db` with a directory and launch.
   *
   * Expected:
   *   - The Library shows an alert saying notes are not saved, with a
   *     "Причина: …" part that names the failure (non-empty).
   *   - The banner has no button, so it cannot be dismissed.
   *   - The Library still works for the session: a new note can be created.
   */
  test('Library shows the "not saved" banner with a reason; no dismiss control', async () => {
    const dir = brokenUserDataDir();
    const handles = await launchApp({ reuseUserDataDir: dir });
    try {
      const library = new LibraryPage(handles.library);
      const banner = library.storageBanner();
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('Заметки не сохраняются');
      await expect(banner).toContainText(/Причина: \S+/);
      await expect(banner.getByRole('button')).toHaveCount(0);

      await library.pressNewShortcut();
      await expect(library.cards()).toHaveCount(1);
      await expect(banner).toBeVisible();
    } finally {
      await handles.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * @scenario Unopenable database: Draft shows the one-line strip, full and pinned
   * @area Cross-window
   * @feature Storage fallback (bug #03)
   * @type negative
   * @priority P0
   *
   * Steps:
   *   1. Replace `userData/inmemnote.db` with a directory and launch.
   *   2. Summon Draft, then pin it.
   *
   * Expected:
   *   - The Draft shows the "Не сохраняется: хранилище недоступно" strip.
   *   - After pinning (compact 320 px layout) the strip is still visible.
   */
  test('Draft shows the "not saved" strip in both full and pinned modes', async () => {
    const dir = brokenUserDataDir();
    const handles = await launchApp({ reuseUserDataDir: dir });
    try {
      const draft = await DraftPage.summon(handles.app);
      await expect(draft.storageStrip()).toBeVisible();
      await expect(draft.storageStrip()).toContainText('хранилище недоступно');

      await draft.clickPin();
      await expect(draft.storageStrip()).toBeVisible();
    } finally {
      await handles.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * @scenario The warning is truthful: notes written under the fallback are gone after a restart
   * @area Cross-window
   * @feature Storage fallback (bug #03)
   * @type persistence
   * @priority P2
   *
   * Steps:
   *   1. Launch on an unopenable database, create a note "Ephemeral".
   *   2. Quit and relaunch on the same userData (still unopenable).
   *
   * Expected:
   *   - Before the restart the note is listed and the banner is up.
   *   - After the restart the Library is empty and the banner is up again.
   */
  test('notes written under the fallback do not survive a restart', async () => {
    const dir = brokenUserDataDir();
    const first = await launchApp({ reuseUserDataDir: dir });
    let second: Awaited<ReturnType<typeof restartApp>> | undefined;
    try {
      const library = new LibraryPage(first.library);
      await expect(library.storageBanner()).toBeVisible();
      await library.pressNewShortcut();
      await library.typeIntoEditor('Ephemeral');
      await library.waitForCardTitle('Ephemeral');

      second = await restartApp(first);
      const relaunched = new LibraryPage(second.library);
      await expect(relaunched.storageBanner()).toBeVisible();
      await expect(relaunched.cards()).toHaveCount(0);
    } finally {
      await (second ?? first).dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * @scenario A database that disappears while the app runs raises the banner in both windows
   * @area Cross-window
   * @feature Storage fallback / Write failure (ADR 0008)
   * @type negative
   * @priority P1
   *
   * Steps:
   *   1. Launch healthy; summon Draft (no warning in either window).
   *   2. Delete `userData/inmemnote.db` from disk while the app runs.
   *   3. Create a note in the Library (a write).
   *
   * Expected:
   *   - The write is detected as not persisted: the Library banner and the
   *     Draft strip both appear without a restart (`storage:changed` push).
   */
  test('deleting the DB file under a running app raises the banner without a restart', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      const draft = await DraftPage.summon(handles.app);
      await expect(library.storageBanner()).toHaveCount(0);
      await expect(draft.storageStrip()).toHaveCount(0);

      rmSync(join(handles.userDataDir, 'inmemnote.db'), { force: true });
      await library.pressNewShortcut();

      await expect(library.storageBanner()).toBeVisible();
      await expect(draft.storageStrip()).toBeVisible();
    } finally {
      await handles.dispose();
    }
  });
});
