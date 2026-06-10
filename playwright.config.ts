import { defineConfig } from '@playwright/test';

/**
 * E2E run for the Electron app.
 *
 * Each test spins up its own Electron instance against a fresh tmp
 * `userData` directory (see `e2e/helpers/app.ts`), so specs are
 * independent and can run in parallel. The global `openDraft` shortcut
 * is the only piece of shared OS state, and it is left unregistered in
 * E2E mode (Playwright drives the overlay via the `__inmemnoteTest`
 * IPC channel, not a real OS hotkey) — see `HotkeyService` `disabled`
 * option.
 *
 * CI worker count is capped at 2: the macos-latest runner has 3 vCPUs
 * and every worker boots its own Electron, so going higher trades
 * wallclock for flake.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 1,
  // CI runners (macos-latest) are noticeably slower than a local Mac;
  // automatic retries absorb the occasional flake while still surfacing
  // genuinely broken tests (a true failure repeats).
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
  },
});
