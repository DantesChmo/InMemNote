import { CheckForUpdateUseCase } from '@application/update/CheckForUpdateUseCase';
import { InstallUpdateUseCase } from '@application/update/InstallUpdateUseCase';
import { AppVersion } from '@domain/update/AppVersion';
import { IPC } from '@infrastructure/electron/ipc-channels';
import { createDmgSelfUpdater } from '@infrastructure/update/DmgSelfUpdater';
import { GithubReleaseGateway } from '@infrastructure/update/GithubReleaseGateway';
import { app, BrowserWindow } from 'electron';

import { buildContainer } from './composition';
import { registerE2eAffordances } from './e2e';
import { HotkeyService } from './hotkey';
import { registerDraftIpc } from './ipc/draft';
import { registerNotesIpc } from './ipc/notes';
import { registerSettingsIpc } from './ipc/settings';
import { registerUpdateIpc } from './ipc/update';
import { DraftWindowController } from './windows/DraftWindowController';
import { LibraryWindowController } from './windows/LibraryWindowController';

/** How often to re-check the release feed while the app is running. */
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
/** Delay before the first check so it doesn't compete with startup work. */
const UPDATE_FIRST_CHECK_DELAY_MS = 8000;

/**
 * Electron main process entry point.
 *
 * Two windows:
 *   - **Library** — the main application window. Visible Dock icon, opens at
 *     startup, has a normal title bar. Created lazily so a global-hotkey-only
 *     workflow (the user never opens Library) doesn't pay the cost.
 *   - **Draft** — a frameless overlay summoned by the global hotkey. Hides on
 *     blur unless pinned.
 *
 * Both windows live in the same renderer bundle, routed by `?view=` in the URL.
 */

// The Draft window's BrowserWindow is created inside `DraftWindowController`,
// which can only be instantiated after `app.whenReady()` has resolved.
// `null` until then. After construction the controller owns its own state
// (pinned mode, animation, drag/resize cursor streams, geometry).
let draftController: DraftWindowController | null = null;
let hotkey: HotkeyService | null = null;
const libraryController = new LibraryWindowController();

// ---------- Test-mode hooks ----------
//
// These are inert in production builds: they only activate when the binary is
// launched with `INMEMNOTE_E2E=1`. We isolate them here so the test affordances
// are obvious and easy to audit (no scattered `if (env)` checks across the code).
//
// 1. `INMEMNOTE_USER_DATA` redirects the userData directory to a fresh tmp
//    folder per E2E run, giving each test a clean SQLite file.
// 2. `INMEMNOTE_E2E=1` enables the `__test__:showDraft` IPC channel that
//    Playwright uses to summon the Draft overlay without firing a real
//    system-wide hotkey (Playwright cannot dispatch those).
const E2E_MODE = process.env.INMEMNOTE_E2E === '1';
if (process.env.INMEMNOTE_USER_DATA) {
  // `setPath('userData', ...)` MUST run before any `app.getPath('userData')`
  // call — Electron caches the resolved value on first access.
  app.setPath('userData', process.env.INMEMNOTE_USER_DATA);
}

/** Broadcast "the library changed" to every open window. */
function emitNotesChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(IPC.NotesChanged);
  }
}

// ---------- App lifecycle ----------

app.whenReady().then(async () => {
  const { drafts, settings, uc } = buildContainer();

  // Resolve the effective accelerator BEFORE creating windows so the
  // global-hotkey registration below uses the persisted user choice (DB
  // wins) and falls back to the YAML defaults only when nothing was saved.
  //
  // We probe the repo directly so we can tell "user explicitly chose the
  // default" apart from "row was never written" — both surface as the same
  // `AppSettings.default()` through the use-case, but only the latter should
  // defer to YAML.
  const storedSettings = await settings.load();
  const currentSettings = storedSettings ?? (await uc.loadSettings.execute());
  const settingsRowExists = storedSettings !== null;

  draftController = new DraftWindowController();
  libraryController.openOrFocus();

  hotkey = new HotkeyService(() => draftController?.toggle(), { disabled: E2E_MODE });
  hotkey.loadInitial({
    dbAccelerator: currentSettings.openDraftHotkey.accelerator,
    settingsRowExists,
  });

  registerDraftIpc({ controller: draftController, drafts, uc, emitNotesChanged });
  registerNotesIpc({ uc, emitNotesChanged });
  const settingsIpc = registerSettingsIpc({ initial: currentSettings, uc, hotkey });

  // Push the loaded settings into both windows once they're done loading
  // — the renderer applies palette + theme on receipt, before its own
  // `settings.load` call resolves.
  const draftBrowserWin = draftController.browserWindow();
  draftBrowserWin.webContents.once('did-finish-load', () => settingsIpc.pushTo(draftBrowserWin));
  const libraryBrowserWin = libraryController.browserWindow();
  if (libraryBrowserWin) {
    libraryBrowserWin.webContents.once('did-finish-load', () =>
      settingsIpc.pushTo(libraryBrowserWin),
    );
  }

  setupAutoUpdate();

  if (E2E_MODE) registerE2eAffordances(draftController);
});

/**
 * Wire the signing-free self-updater.
 *
 * In E2E the gateway is stubbed to fail-soft (never touches the network) and
 * the automatic timers are skipped, so the suite stays hermetic and offline.
 * A manual `update:check` from the renderer still resolves (to "no update").
 */
function setupAutoUpdate(): void {
  const versionResult = AppVersion.create(app.getVersion());
  if (!versionResult.ok) {
    console.warn('Skipping auto-update: unparseable app version', app.getVersion());
    return;
  }

  const gateway = E2E_MODE
    ? {
        fetchLatest: async () => {
          throw new Error('auto-update disabled under E2E');
        },
      }
    : new GithubReleaseGateway();

  const checkForUpdate = new CheckForUpdateUseCase(gateway, versionResult.value);
  const installUpdate = new InstallUpdateUseCase(
    createDmgSelfUpdater((fraction) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.UpdateProgress, fraction);
      }
    }),
  );

  const updateIpc = registerUpdateIpc({ checkForUpdate, installUpdate });

  if (E2E_MODE) return;
  setTimeout(() => void updateIpc.checkNow(), UPDATE_FIRST_CHECK_DELAY_MS);
  setInterval(() => void updateIpc.checkNow(), UPDATE_CHECK_INTERVAL_MS);
}

app.on('activate', () => {
  // macOS: clicking the Dock icon when no windows are open should resurface
  // the Library — this is the documented platform convention.
  libraryController.openOrFocus();
});

app.on('window-all-closed', () => {
  // Stay alive on macOS so the global hotkey keeps working even after the
  // user closes the Library window. On other platforms (we ship macOS only,
  // but be defensive) quit when no windows remain.
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  hotkey?.unregisterAll();
});
