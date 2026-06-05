import { readFileSync } from 'node:fs';

import { z } from 'zod';

/**
 * Hotkeys config — loaded once at app startup.
 *
 * Source of truth is the packaged `config/hotkeys.json`. The user may override
 * it by placing a file at `~/Library/Application Support/Inmemnote/hotkeys.json`.
 * If the user file is missing or fails validation, we fall back to defaults so
 * the app always launches.
 */

const HotkeysSchema = z.object({
  openDraft: z.string().min(1),
});

export type Hotkeys = z.infer<typeof HotkeysSchema>;

export const DEFAULT_HOTKEYS: Hotkeys = {
  openDraft: 'CommandOrControl+Shift+Space',
};

export interface HotkeysLoadResult {
  hotkeys: Hotkeys;
  /** `null` when defaults were used (no override or override was rejected). */
  source: string | null;
  warning?: string;
}

/**
 * Load hotkeys with this precedence:
 *   1. User override path (if present and valid).
 *   2. Packaged defaults file (if present and valid).
 *   3. Hard-coded `DEFAULT_HOTKEYS`.
 *
 * Reading is synchronous: this runs exactly once during startup, before any
 * window is created. Doing it sync keeps the code straightforward and avoids
 * a race with `globalShortcut.register`.
 */
export function loadHotkeys(opts: {
  defaultsPath: string;
  userOverridePath?: string;
}): HotkeysLoadResult {
  if (opts.userOverridePath) {
    const tryUser = readAndValidate(opts.userOverridePath);
    if (tryUser.ok) {
      return { hotkeys: tryUser.value, source: opts.userOverridePath };
    }
    if (tryUser.exists) {
      return {
        hotkeys: DEFAULT_HOTKEYS,
        source: null,
        warning: `User hotkeys file at ${opts.userOverridePath} is invalid: ${tryUser.reason}`,
      };
    }
  }

  const tryDefaults = readAndValidate(opts.defaultsPath);
  if (tryDefaults.ok) {
    return { hotkeys: tryDefaults.value, source: opts.defaultsPath };
  }

  return {
    hotkeys: DEFAULT_HOTKEYS,
    source: null,
    warning: `Defaults file unreadable (${tryDefaults.reason ?? 'missing'}); using built-in defaults.`,
  };
}

type ReadResult =
  | { ok: true; value: Hotkeys; exists: true }
  | { ok: false; exists: boolean; reason?: string };

function readAndValidate(path: string): ReadResult {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return { ok: false, exists: false };
    return { ok: false, exists: true, reason: err.message };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, exists: true, reason: (e as Error).message };
  }
  const parsed = HotkeysSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, exists: true, reason: parsed.error.message };
  }
  return { ok: true, exists: true, value: parsed.data };
}
