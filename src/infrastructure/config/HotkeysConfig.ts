import { readFileSync } from 'node:fs';

import { load as parseYaml, YAMLException } from 'js-yaml';
import { z } from 'zod';

/**
 * Hotkeys config — loaded once at app startup.
 *
 * Source of truth is the packaged `config/hotkeys.yaml`. The user may
 * override it by placing a file at
 * `~/Library/Application Support/Inmemnote/hotkeys.yaml`. If the user file
 * is missing or fails validation, we fall back to defaults so the app
 * always launches.
 *
 * The file format accepts two shapes per command:
 *
 *   - A single key as a YAML string:        `openDraft: F1`
 *   - A combination as a YAML sequence:     `openDraft: [CommandOrControl, Shift, Space]`
 *
 * The two are equivalent on disk to whatever the user prefers; internally we
 * always normalize to the `Key1+Key2+...` string that Electron's
 * `globalShortcut.register` expects. Allowed key tokens are listed in
 * `docs/HOTKEYS.md` (and mirrored in `ALLOWED_KEYS` below) so a typo doesn't
 * silently produce an unregisterable shortcut.
 */

// ---------- Allowed key tokens ----------
//
// We keep one flat allow-list of every token we accept in YAML. The list
// mirrors Electron's accelerator vocabulary; the doc table in
// `docs/HOTKEYS.md` is the user-facing copy of the same set.

const MODIFIER_KEYS = [
  'Command',
  'Cmd',
  'Control',
  'Ctrl',
  'CommandOrControl',
  'CmdOrCtrl',
  'Alt',
  'Option',
  'AltGr',
  'Shift',
  'Super',
  'Meta',
] as const;

const SPECIAL_KEYS = [
  'Plus',
  'Space',
  'Tab',
  'Capslock',
  'Numlock',
  'Scrolllock',
  'Backspace',
  'Delete',
  'Insert',
  'Return',
  'Enter',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Escape',
  'Esc',
  'PrintScreen',
] as const;

const MEDIA_KEYS = [
  'VolumeUp',
  'VolumeDown',
  'VolumeMute',
  'MediaNextTrack',
  'MediaPreviousTrack',
  'MediaStop',
  'MediaPlayPause',
] as const;

const NUMPAD_KEYS = [
  'NumpadDecimal',
  'NumpadAdd',
  'NumpadSubtract',
  'NumpadMultiply',
  'NumpadDivide',
  'Numpad0',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
  'Numpad5',
  'Numpad6',
  'Numpad7',
  'Numpad8',
  'Numpad9',
] as const;

const FUNCTION_KEYS = Array.from({ length: 24 }, (_, i) => `F${i + 1}`);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '0123456789'.split('');

const ALLOWED_KEYS: ReadonlySet<string> = new Set<string>([
  ...MODIFIER_KEYS,
  ...SPECIAL_KEYS,
  ...MEDIA_KEYS,
  ...NUMPAD_KEYS,
  ...FUNCTION_KEYS,
  ...LETTERS,
  ...DIGITS,
]);

const keyToken = z
  .string()
  .min(1)
  .refine((s) => ALLOWED_KEYS.has(s), {
    message: 'Unknown key token. See docs/HOTKEYS.md for the full list.',
  });

// A binding is either a single token (string) or a non-empty sequence
// (array). Sequences let the user see modifier vs. target key without
// staring at a `+` separator.
const keyBinding = z.union([keyToken, z.array(keyToken).min(1)]);

const HotkeysFileSchema = z
  .object({
    openDraft: keyBinding,
  })
  .strict(); // typos like `openDraf:` → loud validation error

/** Internal — exactly what the YAML can carry. */
type HotkeysFile = z.infer<typeof HotkeysFileSchema>;

/**
 * Normalized hotkeys, ready for `globalShortcut.register`.
 *
 * Every value is the `Key1+Key2+…` accelerator string Electron expects,
 * regardless of whether the YAML used a string or a sequence.
 */
export interface Hotkeys {
  openDraft: string;
}

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
 */
export function loadHotkeys(opts: {
  defaultsPath: string;
  userOverridePath?: string;
}): HotkeysLoadResult {
  if (opts.userOverridePath) {
    const tryUser = readAndValidate(opts.userOverridePath);
    if (tryUser.ok) {
      return { hotkeys: normalize(tryUser.value), source: opts.userOverridePath };
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
    return { hotkeys: normalize(tryDefaults.value), source: opts.defaultsPath };
  }

  return {
    hotkeys: DEFAULT_HOTKEYS,
    source: null,
    warning: `Defaults file unreadable (${tryDefaults.reason ?? 'missing'}); using built-in defaults.`,
  };
}

function normalize(file: HotkeysFile): Hotkeys {
  return {
    openDraft: toAccelerator(file.openDraft),
  };
}

function toAccelerator(value: string | string[]): string {
  return Array.isArray(value) ? value.join('+') : value;
}

type ReadResult =
  | { ok: true; value: HotkeysFile; exists: true }
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

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    const reason = e instanceof YAMLException ? e.message : (e as Error).message;
    return { ok: false, exists: true, reason };
  }

  const validated = HotkeysFileSchema.safeParse(parsed);
  if (!validated.success) {
    return { ok: false, exists: true, reason: validated.error.message };
  }
  return { ok: true, exists: true, value: validated.data };
}
