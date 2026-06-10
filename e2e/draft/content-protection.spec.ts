import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';

/**
 * The Draft window has to be hidden from screen-capture (Zoom / Meet /
 * QuickTime / ScreenCaptureKit) for both pinned and un-pinned states. We do
 * this with `BrowserWindow.setContentProtection(true)` inside
 * `createDraftWindow`, which maps to macOS `NSWindowSharingNone`.
 *
 * Electron 33 doesn't expose a public getter for content protection state,
 * so we can't read it back. We DO test the two things that would actually
 * regress this behavior in code:
 *
 *   1. The `setContentProtection` API is present on the live Draft window
 *      (an Electron upgrade renaming or removing it would otherwise pass
 *      silently — the call inside `createDraftWindow` is a no-op without
 *      throwing).
 *   2. Pinning and un-pinning the Draft don't disable protection. We do
 *      this by spying on `setContentProtection` after launch and asserting
 *      that no call with `false` lands during a pin → unpin → pin cycle.
 */

/**
 * @scenario Content protection (NSWindowSharingNone) is preserved across pin/unpin cycles
 * @area Draft
 * @feature Security / Screen capture
 * @type positive
 * @priority P0
 *
 * Preconditions:
 *   - macOS host with `setContentProtection` available on BrowserWindow.
 *
 * Steps:
 *   1. Confirm `setContentProtection` is a function on the live Draft window.
 *   2. Patch `BrowserWindow.prototype.setContentProtection` to record every call.
 *   3. Summon Draft, type, then pin → unpin → pin (await each animation).
 *   4. Read back the recorded calls; restore the original method.
 *
 * Expected:
 *   - The API is present on the window.
 *   - The recorded calls do NOT include any `false` argument.
 */
test('draft window keeps content protection across pin/unpin cycles', async () => {
  const handles = await launchApp();
  try {
    // 1. API surface check.
    const apiPresent = await handles.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('view=draft'),
      );
      return typeof w?.setContentProtection === 'function';
    });
    expect(apiPresent).toBe(true);

    // 2. Spy on the prototype: patches the method for every BrowserWindow
    //    instance, including the one already constructed. The original is
    //    captured into a global so the patch is reversible.
    await handles.app.evaluate(({ BrowserWindow }) => {
      const proto = BrowserWindow.prototype as unknown as {
        setContentProtection: (this: unknown, enable: boolean) => void;
      };
      const g = globalThis as {
        __cpOriginal?: (this: unknown, enable: boolean) => void;
        __cpCalls?: boolean[];
      };
      g.__cpOriginal = proto.setContentProtection;
      g.__cpCalls = [];
      proto.setContentProtection = function (enable: boolean) {
        g.__cpCalls!.push(enable);
        return g.__cpOriginal!.call(this, enable);
      };
    });

    try {
      const draft = await DraftPage.summon(handles.app);
      await draft.typeIntoEditor('private');
      await draft.raw.waitForTimeout(200);

      // pin → unpin → pin.
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);
      await draft.clickPin();
      await draft.raw.waitForTimeout(700);

      const calls = await handles.app.evaluate(() => {
        const g = globalThis as { __cpCalls?: boolean[] };
        return g.__cpCalls ?? [];
      });

      // Nothing in the pin/unpin path should ever flip protection off.
      expect(calls).not.toContain(false);
    } finally {
      // Restore the original implementation so other tests are unaffected.
      await handles.app.evaluate(({ BrowserWindow }) => {
        const proto = BrowserWindow.prototype as unknown as {
          setContentProtection: (this: unknown, enable: boolean) => void;
        };
        const g = globalThis as {
          __cpOriginal?: (this: unknown, enable: boolean) => void;
          __cpCalls?: boolean[];
        };
        if (g.__cpOriginal) {
          proto.setContentProtection = g.__cpOriginal;
        }
        delete g.__cpOriginal;
        delete g.__cpCalls;
      });
    }
  } finally {
    await handles.dispose();
  }
});
