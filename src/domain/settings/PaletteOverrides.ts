import { DomainError } from '@domain/shared/DomainError';
import { err, ok, type Result } from '@shared/Result';

/**
 * PaletteOverrides — user-customizable subset of design tokens.
 *
 * The full token set lives in `presentation/theme/tokens.css`, where each
 * `--token` has dark- and light-theme defaults. Settings let the user pick a
 * specific color for any token in `PALETTE_TOKEN_KEYS`; everything else stays
 * on its theme-driven default. An override applies globally — it is NOT
 * remembered separately per theme.
 *
 * Storage shape is intentionally sparse (a partial map keyed by token name)
 * so the schema doesn't need to know every token's default value. Tokens
 * absent from the map fall back to the CSS file's `var(--token)` chain.
 */

export const PALETTE_TOKEN_KEYS = [
  'accent',
  'accent-ink',
  'panel',
  'panel-2',
  'sink',
  'text',
  'text-2',
  'text-3',
  'bar',
] as const;

export type PaletteTokenKey = (typeof PALETTE_TOKEN_KEYS)[number];

const PALETTE_TOKEN_SET: ReadonlySet<string> = new Set<string>(PALETTE_TOKEN_KEYS);

// Hex color: `#RGB`, `#RRGGBB`, or `#RRGGBBAA` (alpha). We allow shorthand
// because the popup's HTML color picker emits 6-digit `#RRGGBB`, but
// hand-edited JSON might use a different style — staying permissive keeps the
// import path forgiving.
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export class InvalidPaletteTokenError extends DomainError {
  public readonly code = 'PALETTE_TOKEN_INVALID';
  public constructor(key: string) {
    super(`Unknown palette token: "${key}"`);
  }
}

export class InvalidPaletteColorError extends DomainError {
  public readonly code = 'PALETTE_COLOR_INVALID';
  public constructor(key: string, value: string) {
    super(`Invalid color for palette token "${key}": "${value}"`);
  }
}

export type PaletteOverridesError = InvalidPaletteTokenError | InvalidPaletteColorError;

/**
 * Frozen map of `{ tokenKey -> hex color }`. Built via the static factory so
 * every entry is validated; callers that want a per-token edit produce a new
 * `PaletteOverrides` value rather than mutating the existing one.
 */
export class PaletteOverrides {
  private constructor(private readonly entries: ReadonlyMap<PaletteTokenKey, string>) {}

  public static empty(): PaletteOverrides {
    return new PaletteOverrides(new Map());
  }

  public static create(
    raw: Readonly<Partial<Record<string, string>>>,
  ): Result<PaletteOverrides, PaletteOverridesError> {
    const entries = new Map<PaletteTokenKey, string>();
    for (const [key, value] of Object.entries(raw)) {
      if (value === undefined) continue;
      if (!PALETTE_TOKEN_SET.has(key)) {
        return err(new InvalidPaletteTokenError(key));
      }
      if (!HEX_COLOR_RE.test(value)) {
        return err(new InvalidPaletteColorError(key, value));
      }
      entries.set(key as PaletteTokenKey, value);
    }
    return ok(new PaletteOverrides(entries));
  }

  public static isValidColor(value: string): boolean {
    return HEX_COLOR_RE.test(value);
  }

  public get(key: PaletteTokenKey): string | undefined {
    return this.entries.get(key);
  }

  public has(key: PaletteTokenKey): boolean {
    return this.entries.has(key);
  }

  public withToken(
    key: PaletteTokenKey,
    value: string,
  ): Result<PaletteOverrides, InvalidPaletteColorError> {
    if (!HEX_COLOR_RE.test(value)) {
      return err(new InvalidPaletteColorError(key, value));
    }
    const next = new Map(this.entries);
    next.set(key, value);
    return ok(new PaletteOverrides(next));
  }

  public withoutToken(key: PaletteTokenKey): PaletteOverrides {
    if (!this.entries.has(key)) return this;
    const next = new Map(this.entries);
    next.delete(key);
    return new PaletteOverrides(next);
  }

  public toJSON(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.entries);
  }

  /** Stable iteration order matches `PALETTE_TOKEN_KEYS` for the UI list. */
  public toOrderedPairs(): readonly { key: PaletteTokenKey; value: string }[] {
    return PALETTE_TOKEN_KEYS.flatMap((key) => {
      const v = this.entries.get(key);
      return v ? [{ key, value: v }] : [];
    });
  }

  public isEmpty(): boolean {
    return this.entries.size === 0;
  }
}
