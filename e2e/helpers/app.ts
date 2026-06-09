import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface AppHandles {
  app: ElectronApplication;
  library: Page;
  userDataDir: string;
}

export interface LaunchOptions {
  /**
   * Reuse an existing userData directory instead of provisioning a fresh
   * tmp folder. Useful for persistence tests across app restarts.
   */
  reuseUserDataDir?: string;
}

/**
 * Boot the app with an isolated userData directory.
 *
 * We launch in **unpackaged** mode: Playwright spawns the stock Electron
 * binary from `node_modules/electron` and points it at the project root, so
 * Electron reads `package.json#main` (`.vite/build/main.js`) just like the
 * packaged variant would. The reason we don't use the packaged `.app`: the
 * Playwright Electron driver controls the argv vector, and a custom
 * executable hides the remote-debugging port flag that Playwright needs to
 * attach. With unpackaged Electron, attachment is automatic.
 *
 * Pre-condition: `npm run e2e:prepare` must have produced `.vite/build/*.js`
 * and `.vite/renderer/main_window/index.html` at least once.
 */
export async function launchApp(
  opts: LaunchOptions = {},
): Promise<AppHandles & { dispose: () => Promise<void> }> {
  const userDataDir = opts.reuseUserDataDir ?? mkdtempSync(join(tmpdir(), 'inmemnote-e2e-'));
  const ownsDir = !opts.reuseUserDataDir;

  const viteBuild = join(process.cwd(), '.vite', 'build', 'main.js');
  if (!existsSync(viteBuild)) {
    throw new Error(
      `Missing ${viteBuild}. Run \`npm run e2e:prepare\` before \`npm run e2e\`.`,
    );
  }

  const app = await electron.launch({
    // `--lang=ru` pins navigator.language so the i18n layer renders the
    // Russian dictionary regardless of the host runner's OS locale. Tests
    // assert on user-visible strings ("Быстрая заметка", "не закреплено",
    // "Закреплённые", …) — a CI runner in en-US would otherwise see the
    // English dictionary and fail.
    args: ['--lang=ru', process.cwd()],
    env: {
      ...process.env,
      INMEMNOTE_E2E: '1',
      INMEMNOTE_USER_DATA: userDataDir,
    },
  });

  const library = await waitForWindowByView(app, 'library');
  await library.waitForLoadState('domcontentloaded');

  return {
    app,
    library,
    userDataDir,
    dispose: async () => {
      await app.close().catch(() => undefined);
      // Only clean up directories we created ourselves; a caller-provided
      // dir is their responsibility (and may be needed by subsequent tests).
      if (ownsDir) {
        try {
          rmSync(userDataDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    },
  };
}

/**
 * Wait until a renderer window whose URL carries `?view=<view>` appears.
 *
 * Electron's `firstWindow()` returns the FIRST ready window, which on app
 * launch is always Library, but we keep this generic so we can also grab the
 * Draft window after summoning it.
 */
export async function waitForWindowByView(
  app: ElectronApplication,
  view: 'library' | 'draft',
  timeoutMs = 10_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      if (page.url().includes(`view=${view}`)) return page;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No window matching view=${view} appeared within ${timeoutMs}ms.`);
}
