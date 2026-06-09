import { DomainError } from '@domain/shared/DomainError';
import { err, ok, type Result } from '@shared/Result';

/**
 * Hotkey — a value object wrapping an Electron accelerator string.
 *
 * The canonical on-disk format is `Key1+Key2+...`, exactly what
 * `globalShortcut.register` expects. Construction validates each token against
 * the allow-list below so a typo in user input fails loudly instead of
 * silently producing an unregisterable shortcut.
 *
 * Why this lives in the domain layer:
 *   - The accelerator vocabulary is part of the application's "ubiquitous
 *     language": every place that talks about hotkeys (settings, YAML loader,
 *     UI capture component) needs the same rules. Keeping the source of truth
 *     in `domain/` lets `infrastructure/` and `presentation/` both depend on
 *     it without violating the layering rule.
 *   - The accelerator string is the user-facing identifier; we treat it as a
 *     value, not as a string. Equality, validation and "is this token a
 *     modifier?" all belong to the type, not to its callers.
 */

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

const MODIFIER_SET: ReadonlySet<string> = new Set<string>(MODIFIER_KEYS);

export const ALLOWED_KEY_TOKENS: ReadonlySet<string> = new Set<string>([
  ...MODIFIER_KEYS,
  ...SPECIAL_KEYS,
  ...MEDIA_KEYS,
  ...NUMPAD_KEYS,
  ...FUNCTION_KEYS,
  ...LETTERS,
  ...DIGITS,
]);

export class InvalidHotkeyError extends DomainError {
  public readonly code = 'HOTKEY_INVALID';
  public constructor(value: string, reason: string) {
    super(`Invalid hotkey "${value}": ${reason}`);
  }
}

export class Hotkey {
  private constructor(public readonly accelerator: string) {}

  /**
   * Build a Hotkey from a plus-joined accelerator (`"CommandOrControl+Shift+Space"`).
   *
   * Rules:
   *   - at least one token;
   *   - every token must be in `ALLOWED_KEY_TOKENS`;
   *   - at least one token must be a non-modifier (a hotkey that is "Shift only"
   *     cannot be registered by Electron — guard at construction time).
   */
  public static create(value: string): Result<Hotkey, InvalidHotkeyError> {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return err(new InvalidHotkeyError(value, 'empty accelerator'));
    }
    const tokens = trimmed.split('+');
    if (tokens.some((t) => t.length === 0)) {
      return err(new InvalidHotkeyError(value, 'empty token between separators'));
    }
    const unknown = tokens.find((t) => !ALLOWED_KEY_TOKENS.has(t));
    if (unknown) {
      return err(new InvalidHotkeyError(value, `unknown key token "${unknown}"`));
    }
    const hasNonModifier = tokens.some((t) => !MODIFIER_SET.has(t));
    if (!hasNonModifier) {
      return err(new InvalidHotkeyError(value, 'requires at least one non-modifier key'));
    }
    return ok(new Hotkey(tokens.join('+')));
  }

  /**
   * Build a Hotkey from an ordered list of tokens. Convenience for callers
   * (e.g. the UI key-capture component) that already track the parts.
   */
  public static fromTokens(tokens: readonly string[]): Result<Hotkey, InvalidHotkeyError> {
    return Hotkey.create(tokens.join('+'));
  }

  /** Token classification — exported so the UI can render modifier chips. */
  public static isModifier(token: string): boolean {
    return MODIFIER_SET.has(token);
  }

  public tokens(): readonly string[] {
    return this.accelerator.split('+');
  }

  public equals(other: Hotkey): boolean {
    return this.accelerator === other.accelerator;
  }
}
