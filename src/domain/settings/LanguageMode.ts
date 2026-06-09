import { DomainError } from '@domain/shared/DomainError';
import { err, ok, type Result } from '@shared/Result';

/**
 * LanguageMode — which UI language the renderer should display.
 *
 * `'system'` defers to the OS locale (resolved in the renderer via
 * `navigator.language`); `'en'` and `'ru'` pin a specific dictionary. Mirrors
 * `ThemeMode` deliberately — the popup renders both with the same segmented
 * control, the persistence layer treats both as plain string values.
 *
 * Adding a new language later is a two-step change: append the code to
 * `LANGUAGE_CODES` here and ship a corresponding dictionary in
 * `presentation/i18n/translations.<code>.ts`. The TS compiler will then
 * complain about every translation table that's missing a key — that's the
 * whole point of keeping the union tight.
 */
export type Locale = 'en' | 'ru';
export type LanguageMode = 'system' | Locale;

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'ru'] as const;
const VALID_MODES: readonly LanguageMode[] = ['system', ...SUPPORTED_LOCALES] as const;

export class InvalidLanguageModeError extends DomainError {
  public readonly code = 'LANGUAGE_MODE_INVALID';
  public constructor(value: string) {
    super(`Invalid LanguageMode: "${value}"`);
  }
}

export const LanguageMode = {
  default(): LanguageMode {
    return 'system';
  },
  values(): readonly LanguageMode[] {
    return VALID_MODES;
  },
  create(value: string): Result<LanguageMode, InvalidLanguageModeError> {
    return (VALID_MODES as readonly string[]).includes(value)
      ? ok(value as LanguageMode)
      : err(new InvalidLanguageModeError(value));
  },
};
