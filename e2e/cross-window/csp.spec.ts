import { expect, test, type Page } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';
import { LibraryPage } from '../helpers/library';

/**
 * The renderer ships a Content-Security-Policy `<meta>` tag injected by the
 * `inmemnote:csp` plugin in `vite.renderer.config.ts`. E2E runs the
 * production build, so this covers the production policy.
 *
 * Two regressions matter: the policy silently disappearing (a Vite or Forge
 * upgrade changing how `index.html` is transformed), and the policy being
 * too strict for what the app does at runtime (CodeMirror injects `<style>`
 * elements, React sets inline `style={…}`).
 */

/** Install a `securitypolicyviolation` recorder on the page. */
async function recordViolations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
}

async function readViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
}

/**
 * Try to run an inline script the way an injected payload would. Returns
 * whether it executed.
 */
async function inlineScriptRuns(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const flag = () => window as unknown as { __inlineRan?: boolean };
    flag().__inlineRan = false;
    const s = document.createElement('script');
    s.textContent = 'window.__inlineRan = true;';
    // An allowed inline script runs synchronously on insertion.
    document.head.appendChild(s);
    s.remove();
    return flag().__inlineRan === true;
  });
}

async function cspContent(page: Page): Promise<string | null> {
  return page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
}

/**
 * @scenario Both windows enforce the CSP: inline scripts are blocked, editor and inline styles work without violations
 * @area Cross-window
 * @feature Security / Content-Security-Policy
 * @type positive
 * @priority P0
 *
 * Steps:
 *   1. Launch app; read the CSP meta tag in Library.
 *   2. Record `securitypolicyviolation` events in Library.
 *   3. Append an inline `<script>` that sets a window flag.
 *   4. Create a note and type into the CodeMirror editor.
 *   5. Summon Draft; repeat steps 1–3 there and type into its editor.
 *
 * Expected:
 *   - The meta tag exists in both windows with `script-src 'self'` and no
 *     `'unsafe-inline'` / `'unsafe-eval'` for scripts.
 *   - The inline script does not execute.
 *   - The editor renders the typed text; the only recorded violation is
 *     the deliberate inline script.
 */
test('both windows enforce the renderer CSP without breaking the editor', async () => {
  const handles = await launchApp();
  try {
    const { library, app } = handles;

    // 1–3. Library.
    const libraryPolicy = await cspContent(library);
    expect(libraryPolicy).toContain("script-src 'self'");
    expect(libraryPolicy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);

    await recordViolations(library);
    expect(await inlineScriptRuns(library)).toBe(false);

    // 4. CodeMirror mounts and injects its style elements under the policy.
    const lib = new LibraryPage(library);
    await lib.clickNew();
    await lib.typeIntoEditor('CSP probe');
    await lib.waitForEditorText('CSP probe');

    const libraryViolations = await readViolations(library);
    expect(libraryViolations).toHaveLength(1);
    expect(libraryViolations[0]).toMatch(/^script-src/);

    // 5. Draft.
    const draft = await DraftPage.summon(app);
    const draftWin = app.windows().find((p) => p.url().includes('view=draft'));
    if (!draftWin) throw new Error('Draft window not found after summon');

    expect(await cspContent(draftWin)).toBe(libraryPolicy);
    await recordViolations(draftWin);
    expect(await inlineScriptRuns(draftWin)).toBe(false);

    await draft.typeIntoEditor('draft probe');
    await expect.poll(() => draft.editorText()).toContain('draft probe');

    const draftViolations = await readViolations(draftWin);
    expect(draftViolations).toHaveLength(1);
    expect(draftViolations[0]).toMatch(/^script-src/);
  } finally {
    await handles.dispose();
  }
});
