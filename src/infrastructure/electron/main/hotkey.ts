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
export class HotkeyService {
  private registered: string | null = null;

  constructor(private readonly onTrigger: () => void) {}

  /**
   * Resolve the effective accelerator (DB-first, YAML fallback) and
   * register it. The caller is expected to know whether a settings row
   * already exists in the DB — that's the signal we use to tell "user
   * explicitly chose the default in the popup" from "row was never
   * written", since both surface the same value through the use-case
   * but only the latter should fall back to YAML.
   */
  loadInitial(opts: { dbAccelerator: string | null; settingsRowExists: boolean }): void {
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
    globalShortcut.unregisterAll();
    this.registered = null;
  }
}
