import { defineConfig } from '@playwright/test';

/**
 * E2E run for the Electron app.
 *
 * Each test spins up its own Electron instance against a fresh tmp
 * `userData` directory (see `e2e/helpers/app.ts`). Specs are
 * file-independent, but we keep a single worker per process:
 *
 *   - Local: faster, more predictable debug — 1 Electron at a time.
 *   - CI:    on the macos-15-arm64 runner, two parallel Electron
 *            processes hung at startup (every test in both workers
 *            timed out at exactly 30 s without ever rendering a
 *            window). Parallelism on CI now comes from sharding the
 *            suite across runner jobs (matrix in `.github/workflows/
 *            ci.yml`), not from multiple workers within one runner.
 *
 * The global `openDraft` shortcut is left unregistered in E2E mode
 * (Playwright drives the overlay via the `__inmemnoteTest` IPC
 * channel, not a real OS hotkey) — see `HotkeyService` `disabled`
 * option.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  // CI runners (macos-latest) are noticeably slower than a local Mac;
  // automatic retries absorb the occasional flake while still surfacing
  // genuinely broken tests (a true failure repeats).
  retries: process.env.CI ? 2 : 0,
  // Bail on the first definitively-failed test on CI: once one test has
  // exhausted its retries, the job is already red and the remaining ~25
  // tests' Electron boot-up time is wasted runner minutes. Locally we
  // still want the full picture, so the cap is lifted (0 = no limit).
  maxFailures: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
  },
});
