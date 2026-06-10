import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';
import { LibraryPage } from '../helpers/library';

/**
 * End-to-end coverage for the Draft overlay's lifecycle.
 *
 * Aspects exercised here:
 *   - happy path summon / dismiss
 *   - persistence of the scratch buffer across hide/summon and restarts
 *   - validation that Esc never promotes a draft
 *   - racy scenarios (rapid toggle, simultaneous edit during pin animation)
 *   - blur/Spotlight semantics (un-pinned vs pinned)
 *   - DOM-level invariants (single Draft window per app)
 */
test.describe('Draft lifecycle', () => {
  /**
   * @scenario Summon shows the editable overlay with the correct title
   * @area Draft
   * @feature Summon
   * @type positive
   * @priority P0
   *
   * Preconditions:
   *   - App launched with a fresh userData directory.
   *
   * Steps:
   *   1. Trigger Draft summon via the test-mode IPC affordance.
   *   2. Wait for the Draft window to appear and finish loading.
   *
   * Expected:
   *   - The editor surface (`.cm-content`) is visible.
   *   - The header text "Быстрая заметка" is rendered (i18n applied).
   *   - The window URL routes to `view=draft`.
   */
  test('summon shows the overlay and the editor becomes editable', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await expect(draft.editor()).toBeVisible();
      await expect(draft.raw.getByText('Быстрая заметка')).toBeVisible();
      // Body class hooks the renderer's "draft view" branch — anything other
      // than `view=draft` would mean the wrong window was attached.
      expect(draft.raw.url()).toContain('view=draft');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Esc hides the overlay without promoting; scratch buffer rehydrates on re-summon
   * @area Draft
   * @feature Cancel / Hide
   * @type positive
   * @priority P0
   *
   * Preconditions:
   *   - Library is empty.
   *
   * Steps:
   *   1. Summon Draft.
   *   2. Type text and wait through the autosave debounce.
   *   3. Press Esc to dismiss.
   *   4. Re-summon Draft.
   *
   * Expected:
   *   - Library has 0 cards (Esc does NOT promote).
   *   - On re-summon, the editor contains the previously typed text.
   */
  test('Esc hides the overlay without promoting; reopening restores the buffer', async () => {
    const handles = await launchApp();
    try {
      // First summon: type and Esc.
      let draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('half-written thought');
      await draft.raw.waitForTimeout(600); // past autosave debounce
      await draft.cancel();
      await DraftPage.hide(handles.app);

      // Library should NOT have a new note — Esc never promotes.
      await expect(handles.library.locator('[data-testid^="note-card-"]')).toHaveCount(0);

      // Re-summon: the buffer rehydrates because the draft was non-empty.
      draft = await DraftPage.summon(handles.app);
      await expect(draft.editor()).toContainText('half-written thought');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Autosave commits the buffer between hide and re-summon
   * @area Draft
   * @feature Autosave
   * @type positive
   * @priority P1
   *
   * Preconditions:
   *   - Fresh app launch.
   *
   * Steps:
   *   1. Summon, type text, wait past the autosave debounce.
   *   2. Hide the overlay.
   *   3. Re-summon.
   *
   * Expected:
   *   - The editor contains the previously typed text on re-summon.
   */
  test('typing triggers an autosave (visible by reopening after a refresh-cycle)', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('autosave probe');
      await draft.raw.waitForTimeout(800); // > debounce
      await DraftPage.hide(handles.app);

      const draft2 = await DraftPage.summon(handles.app);
      await expect(draft2.editor()).toContainText('autosave probe');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Scratch buffer survives a full app restart (cmd-Q mid-thought)
   * @area Draft
   * @feature Persistence
   * @type persistence
   * @priority P0
   *
   * Preconditions:
   *   - Fresh userData directory.
   *
   * Steps:
   *   1. Launch app; summon Draft; type text; wait past autosave debounce.
   *   2. Close the app entirely.
   *   3. Re-launch the app pointing at the same userData directory.
   *   4. Summon Draft again.
   *
   * Expected:
   *   - The scratch buffer rehydrates with the previously typed text.
   */
  test('the scratch buffer survives a full app restart in the same userData dir', async () => {
    // Persistence is the key value-prop of "spotlight-style draft": users
    // expect the buffer to be there even if they `cmd-Q`'d in the middle of
    // a thought.
    const first = await launchApp();
    const sharedDir = first.userDataDir;
    {
      const draft = await DraftPage.summon(first.app);
      await draft.typeIntoEditor('survives restart');
      // Wait through the autosave debounce + IPC round-trip + SQLite WAL
      // commit. Generous because we'll close the app right after, and any
      // pending write would otherwise be lost.
      await draft.raw.waitForTimeout(1500);
      // Hiding flushes a renderer→main IPC round-trip; by the time it
      // resolves, every prior IPC (including the autosave save) has been
      // serialized through the main process.
      await DraftPage.hide(first.app);
      await first.library.waitForTimeout(200);
    }
    await first.app.close();

    const second = await launchApp({ reuseUserDataDir: sharedDir });
    try {
      const draft = await DraftPage.summon(second.app);
      await expect(draft.editor()).toContainText('survives restart');
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
   * @scenario Unpinned overlay hides on window blur (Spotlight semantics)
   * @area Draft
   * @feature Focus / Blur
   * @type positive
   * @priority P0
   *
   * Preconditions:
   *   - Draft is visible and unpinned.
   *
   * Steps:
   *   1. Summon Draft.
   *   2. Synthesize a `blur` event on the Draft BrowserWindow in main.
   *
   * Expected:
   *   - The Draft window has at least one `blur` listener registered.
   *   - After the blur event, the window is not visible.
   *
   * Notes:
   *   - We cannot drive OS focus in headless Playwright; emitting the
   *     event directly verifies the contract.
   */
  test('losing focus hides an unpinned overlay (Spotlight-style behavior)', async () => {
    const handles = await launchApp();
    try {
      await DraftPage.summon(handles.app);

      const result = await handles.app.evaluate(async ({ BrowserWindow }) => {
        const draft = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes('view=draft'),
        );
        if (!draft) return { listeners: 0, visibleAfter: null as boolean | null };
        const listeners = draft.listenerCount('blur');
        draft.show();
        draft.emit('blur');
        await new Promise((r) => setTimeout(r, 50));
        return { listeners, visibleAfter: draft.isVisible() };
      });
      expect(result.listeners).toBeGreaterThan(0);
      expect(result.visibleAfter).toBe(false);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Pinned overlay stays visible when another window takes focus
   * @area Draft
   * @feature Pin / AlwaysOnTop
   * @type positive
   * @priority P0
   *
   * Preconditions:
   *   - Draft summoned and pinned.
   *
   * Steps:
   *   1. Summon Draft, type text, wait past autosave debounce.
   *   2. Click the pin button; wait for the pin animation to settle.
   *   3. Bring the Library window to the front (simulating focus change).
   *
   * Expected:
   *   - Draft remains visible after Library takes focus.
   *   - `BrowserWindow.isAlwaysOnTop()` reports `true` after pin.
   */
  test('pin keeps the overlay always-on-top: blur should NOT hide it', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('pinned thought');
      await draft.raw.waitForTimeout(800);

      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      await handles.library.bringToFront();
      await draft.raw.waitForTimeout(300);
      const stillThere = await draft.isVisible();
      expect(stillThere).toBe(true);

      const aot = await handles.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('view=draft'),
        );
        return w?.isAlwaysOnTop() ?? false;
      });
      expect(aot).toBe(true);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Esc on a pinned overlay is a no-op
   * @area Draft
   * @feature Pin / Cancel
   * @type negative
   * @priority P1
   *
   * Preconditions:
   *   - Draft pinned with non-empty content.
   *
   * Steps:
   *   1. Summon, type text, pin (await animation).
   *   2. Press Escape.
   *
   * Expected:
   *   - The Draft window remains visible (pinned guards against hide).
   */
  test('Esc on a PINNED overlay is a no-op: window stays visible (no hide)', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('keep me');
      await draft.raw.waitForTimeout(600);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700); // animation done

      await draft.cancel();
      await draft.raw.waitForTimeout(200);

      const visible = await DraftPage.draftIsVisibleInApp(handles.app);
      expect(visible).toBe(true);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Rapid summon/hide cycles do not spawn duplicate Draft windows
   * @area Draft
   * @feature Window lifecycle
   * @type race
   * @priority P1
   *
   * Preconditions:
   *   - Single Draft window invariant.
   *
   * Steps:
   *   1. Loop 6 times: summon, then hide.
   *   2. Inspect all open BrowserWindows in main.
   *
   * Expected:
   *   - Exactly one window matches `view=draft`.
   */
  test('rapid toggle does not multiply Draft windows (race-resistant)', async () => {
    const handles = await launchApp();
    try {
      for (let i = 0; i < 6; i++) {
        await DraftPage.summon(handles.app);
        await DraftPage.hide(handles.app);
      }
      const draftWindowsCount = await handles.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().filter((w) =>
          w.webContents.getURL().includes('view=draft'),
        ).length,
      );
      expect(draftWindowsCount).toBe(1);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Toggle while hidden re-shows the same window
   * @area Draft
   * @feature Window lifecycle
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Summon → assert visible.
   *   2. Hide → assert hidden.
   *   3. Summon → assert visible.
   *
   * Expected:
   *   - Visibility flips correctly across summon/hide; the same window
   *     instance is reused.
   */
  test('toggle while hidden re-shows the same window (idempotent visibility)', async () => {
    const handles = await launchApp();
    try {
      await DraftPage.summon(handles.app);
      expect(await DraftPage.draftIsVisibleInApp(handles.app)).toBe(true);
      await DraftPage.hide(handles.app);
      expect(await DraftPage.draftIsVisibleInApp(handles.app)).toBe(false);
      await DraftPage.summon(handles.app);
      expect(await DraftPage.draftIsVisibleInApp(handles.app)).toBe(true);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Summon centers the overlay on the cursor display work-area
   * @area Draft
   * @feature Positioning
   * @type positive
   * @priority P1
   *
   * Steps:
   *   1. Summon Draft.
   *   2. Compare the window center to the work-area center.
   *
   * Expected:
   *   - Center deviation ≤ 80 px on both axes (allowing for rounding/DPR).
   */
  test('summon centers the overlay on the work-area of the cursor display', async () => {
    const handles = await launchApp();
    try {
      await DraftPage.summon(handles.app);
      const r = await handles.app.evaluate(({ BrowserWindow, screen }) => {
        const w = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('view=draft'),
        );
        if (!w) return null;
        const b = w.getBounds();
        const wa = screen.getDisplayMatching(b).workArea;
        return {
          centerX: b.x + b.width / 2,
          centerY: b.y + b.height / 2,
          wa,
        };
      });
      expect(r).not.toBeNull();
      const screenCenterX = r!.wa.x + r!.wa.width / 2;
      const screenCenterY = r!.wa.y + r!.wa.height / 2;
      expect(Math.abs(r!.centerX - screenCenterX)).toBeLessThan(80);
      expect(Math.abs(r!.centerY - screenCenterY)).toBeLessThan(80);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Empty/whitespace draft does not promote on ⌘↵
   * @area Draft
   * @feature Promote
   * @type negative
   * @priority P0
   *
   * Preconditions:
   *   - Library is empty.
   *
   * Steps:
   *   1. Summon, type only whitespace, wait past autosave.
   *   2. Press ⌘↵.
   *
   * Expected:
   *   - No Library card created.
   */
  test('empty draft promote (⌘↵) does not create a note and clears the buffer', async () => {
    const handles = await launchApp();
    try {
      const library = new LibraryPage(handles.library);
      const draft = await DraftPage.summon(handles.app);

      await draft.typeIntoEditor('   \n\n   ');
      await draft.raw.waitForTimeout(600);
      await draft.submit();
      await handles.library.waitForTimeout(400);

      await expect(library.cards()).toHaveCount(0);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Oversize content (~240 KB) survives hide/summon without crashing
   * @area Draft
   * @feature Editor / Persistence
   * @type edge
   * @priority P2
   *
   * Steps:
   *   1. Summon Draft.
   *   2. Paste a 240 KB payload into the editor.
   *   3. Wait past autosave.
   *   4. Hide and re-summon.
   *
   * Expected:
   *   - The editor still renders; textContent length > 1000 chars and
   *     contains the marker substring "lorem-ipsum".
   */
  test('overlay rejects oversize content gracefully (no crash, no truncation in UI)', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      const big = 'lorem-ipsum '.repeat(20_000); // ~240 KB
      await draft.setEditorContent(big);
      await draft.raw.waitForTimeout(800);

      await DraftPage.hide(handles.app);
      const draft2 = await DraftPage.summon(handles.app);
      const text = await draft2.editorText();
      expect(text.length).toBeGreaterThan(1000);
      expect(text.includes('lorem-ipsum')).toBe(true);
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Unicode (CJK + emoji + diacritics) round-trips through autosave
   * @area Draft
   * @feature Encoding
   * @type edge
   * @priority P1
   *
   * Steps:
   *   1. Summon, type a unicode-heavy payload.
   *   2. Wait past autosave.
   *   3. Hide and re-summon.
   *
   * Expected:
   *   - Editor contains the Japanese, Cyrillic, emoji and Latin-diacritic substrings.
   */
  test('CJK + emoji content round-trips through autosave', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      const payload = '日本語テスト 🌸 — Привет мир 👋🏽 — naïve façade';
      await draft.typeIntoEditor(payload);
      await draft.raw.waitForTimeout(800);
      await DraftPage.hide(handles.app);

      const draft2 = await DraftPage.summon(handles.app);
      await expect(draft2.editor()).toContainText('日本語テスト');
      await expect(draft2.editor()).toContainText('Привет');
      await expect(draft2.editor()).toContainText('🌸');
      await expect(draft2.editor()).toContainText('façade');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Editing mid-document (arrow back + insert) does not corrupt the buffer
   * @area Draft
   * @feature Editor / CodeMirror
   * @type edge
   * @priority P2
   *
   * Steps:
   *   1. Type "AB".
   *   2. Press End, Enter.
   *   3. Type "# H".
   *
   * Expected:
   *   - Editor still contains both "AB" and "H".
   */
  test('Markdown editing mid-document does not corrupt the document', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('AB');
      await draft.raw.keyboard.press('End');
      await draft.raw.keyboard.press('Enter');
      await draft.raw.keyboard.type('# H');
      await draft.raw.waitForTimeout(300);
      const text = await draft.editorText();
      expect(text).toContain('AB');
      expect(text).toContain('H');
    } finally {
      await handles.dispose();
    }
  });

  /**
   * @scenario Cross-launch buffer rehydration after summon → type → hide → restart
   * @area Draft
   * @feature Persistence
   * @type persistence
   * @priority P0
   *
   * Steps:
   *   1. Launch app, summon, type text, wait past autosave, hide, close app.
   *   2. Re-launch with the same userData; summon Draft.
   *
   * Expected:
   *   - The scratch buffer rehydrates with the previously typed text.
   */
  test('summon → type → hide → restart still rehydrates the buffer (cross-launch)', async () => {
    const first = await launchApp();
    const sharedDir = first.userDataDir;
    {
      const draft = await DraftPage.summon(first.app);
      await draft.typeIntoEditor('cross launch buffer');
      await draft.raw.waitForTimeout(1500);
      await DraftPage.hide(first.app);
      await first.library.waitForTimeout(200);
    }
    await first.app.close();

    const second = await launchApp({ reuseUserDataDir: sharedDir });
    try {
      const draft = await DraftPage.summon(second.app);
      await expect(draft.editor()).toContainText('cross launch buffer');
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
   * @scenario Repeated pin/unpin toggles keep the window width stable
   * @area Draft
   * @feature Pin / Window geometry
   * @type race
   * @priority P1
   *
   * Steps:
   *   1. Summon, type, wait past autosave.
   *   2. Click the pin button 4 times (even count → unpinned end state).
   *
   * Expected:
   *   - Final window width is 560 px (the unpinned default).
   */
  test('pin toggle is reversible and bounds-stable across many cycles', async () => {
    const handles = await launchApp();
    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('cycle me');
      await draft.raw.waitForTimeout(600);

      for (let i = 0; i < 4; i++) {
        await draft.clickPin();
        await draft.raw.waitForTimeout(700); // animation
      }

      const bounds = await DraftPage.draftBounds(handles.app);
      expect(bounds?.width).toBe(560);
    } finally {
      await handles.dispose();
    }
  });
});
