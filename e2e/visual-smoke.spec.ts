import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, test, expect } from '@playwright/test';

/**
 * Visual smoke that uses the unpackaged path so Playwright can drive CDP.
 *
 * We launch the stock Electron binary that ships with the project's
 * `node_modules` and point it at the project root; Electron then reads
 * `package.json#main` (= `.vite/build/main.js`) just like the packaged
 * variant would. The difference is that Playwright owns the argv vector and
 * adds the `--remote-debugging-port` it needs to attach.
 */

/**
 * @scenario Renderer applies design tokens (accent, panel) and Tailwind utilities; Draft overlay screenshot is produced
 * @area Visual
 * @feature Design tokens / Bootstrap
 * @type positive
 * @priority P0
 *
 * Steps:
 *   1. Launch app (unpackaged), grab the first window.
 *   2. Read CSS custom properties on `:root` (`--accent`, `--panel`, …).
 *   3. Take a full-page screenshot of Library, then summon Draft and screenshot it.
 *
 * Expected:
 *   - `--accent` resolves to `#3f7d6b` (brand accent).
 *   - `--panel` is non-empty (token CSS loaded).
 *   - `#root` innerHTML length > 100 (React mounted content).
 *
 * Notes:
 *   - Screenshots land in `test-results/`; they are visual regression aids,
 *     not assertions.
 */
test('renderer applies design tokens and Tailwind utilities', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'inmemnote-vis-'));
  const app = await electron.launch({
    args: [process.cwd()],
    env: { ...process.env, INMEMNOTE_E2E: '1', INMEMNOTE_USER_DATA: userDataDir },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  const diag = await page.evaluate(() => {
    const root = document.documentElement;
    const rootStyle = getComputedStyle(root);
    const body = document.body;
    return {
      theme: root.dataset.theme,
      accent: rootStyle.getPropertyValue('--accent').trim(),
      panel: rootStyle.getPropertyValue('--panel').trim(),
      text: rootStyle.getPropertyValue('--text').trim(),
      bodyBg: getComputedStyle(body).backgroundColor,
      rootHTMLLen: document.getElementById('root')?.innerHTML.length ?? 0,
      stylesheets: document.styleSheets.length,
      cssRulesTotal: Array.from(document.styleSheets).reduce(
        (n, s) => n + ((s.cssRules?.length as number) ?? 0),
        0,
      ),
    };
  });
  // eslint-disable-next-line no-console
  console.log('[visual-smoke]', JSON.stringify(diag, null, 2));

  await page.screenshot({ path: 'test-results/visual-smoke.png', fullPage: true });

  // Also screenshot the Draft overlay so we can eyeball the lack of macOS
  // traffic lights and the frameless look.
  await app.evaluate(() => {
    const t = (globalThis as { __inmemnoteTest?: { showDraft: () => void } }).__inmemnoteTest;
    t?.showDraft();
  });
  const draft = await app.windows().find((w) => w.url().includes('view=draft'))
    ?? (await new Promise<import('@playwright/test').Page>((resolve) => {
      const tick = () => {
        const found = app.windows().find((w) => w.url().includes('view=draft'));
        if (found) resolve(found);
        else setTimeout(tick, 100);
      };
      tick();
    }));
  await draft.waitForLoadState('domcontentloaded');
  await draft.waitForTimeout(500);
  await draft.screenshot({ path: 'test-results/draft-overlay.png' });

  await app.close();
  rmSync(userDataDir, { recursive: true, force: true });

  // Tokens must actually resolve. Empty strings mean tokens.css did not load.
  expect(diag.accent).toBe('#3f7d6b');
  expect(diag.panel.length).toBeGreaterThan(0);
  expect(diag.rootHTMLLen).toBeGreaterThan(100); // React mounted something
});
