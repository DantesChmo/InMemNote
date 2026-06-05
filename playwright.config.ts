import { defineConfig } from '@playwright/test';

/**
 * E2E run for the Electron app.
 *
 * Tests launch the **packaged** app produced by `npm run e2e:prepare`
 * (which runs `electron-forge package`). The path is derived per platform
 * inside `e2e/helpers/app.ts`.
 *
 * We disable parallelism: every test owns the global Electron instance for
 * the duration of the run, and they each get their own tmp userData folder
 * so SQLite state never bleeds between specs.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
  },
});
