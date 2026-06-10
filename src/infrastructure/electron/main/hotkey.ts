import { join } from 'node:path';

import { loadHotkeys } from '@infrastructure/config/HotkeysConfig';
import { app, globalShortcut } from 'electron';

/**
 * Owns the global hotkey for summoning the Draft overlay.
 *
 * Source of truth precedence (highest first):
 *   1. AppSettings row in SQLite (set via the Settings popup).
 *   2. User YAML override at `userData/hotkeys.yaml`.
 *   3. Packaged defaults at `config/hotkeys.yaml`.
 *   4. The hard-coded fallback inside `loadHotkeys`.
 *
 * The DB lives on top because the settings popup is the documented user
 * workflow; YAML stays as the power-user / scripted-deploy escape hatch.
 */
export interface HotkeyServiceOptions {
  /**
   * When true, every operation becomes a no-op — no `globalShortcut`
   * calls are made. Used by E2E runs where multiple Electron instances
   * coexist on the same host and would otherwise race for the same
   * accelerator (the second `register` returns false on macOS, polluting
   * logs and producing a confusing "hotkey doesn't work" failure mode
   * mid-suite). Playwright drives Draft through the `__inmemnoteTest`
   * IPC channel anyway, so the OS-level shortcut is dead weight in tests.
   */
  disabled?: boolean;
}

export class HotkeyService {
  private registered: string | null = null;
  private readonly disabled: boolean;

  constructor(
    private readonly onTrigger: () => void,
    options: HotkeyServiceOptions = {},
  ) {
    this.disabled = options.disabled ?? false;
  }

  /**
   * Resolve the effective accelerator (DB-first, YAML fallback) and
   * register it. The caller is expected to know whether a settings row
   * already exists in the DB — that's the signal we use to tell "user
   * explicitly chose the default in the popup" from "row was never
   * written", since both surface the same value through the use-case
   * but only the latter should fall back to YAML.
   */
  loadInitial(opts: { dbAccelerator: string | null; settingsRowExists: boolean }): void {
    if (this.disabled) return;
    const { hotkeys: yamlHotkeys, warning } = loadHotkeys({
      defaultsPath: join(app.getAppPath(), 'config/hotkeys.yaml'),
      userOverridePath: join(app.getPath('userData'), 'hotkeys.yaml'),
    });
    if (warning) console.warn(warning);
    const accelerator =
      opts.settingsRowExists && opts.dbAccelerator ? opts.dbAccelerator : yamlHotkeys.openDraft;
    this.register(accelerator);
  }

  /**
   * Replace any currently-registered hotkey with `accelerator`. Used by
   * the Settings popup flow to re-register without restart.
   */
  register(accelerator: string): void {
    if (this.disabled) return;
    if (this.registered) {
      globalShortcut.unregister(this.registered);
      this.registered = null;
    }
    const ok = globalShortcut.register(accelerator, this.onTrigger);
    if (!ok) {
      console.warn(`Could not register hotkey ${accelerator} — likely already taken.`);
      return;
    }
    this.registered = accelerator;
  }

  unregisterAll(): void {
    if (this.disabled) return;
    globalShortcut.unregisterAll();
    this.registered = null;
  }
}
