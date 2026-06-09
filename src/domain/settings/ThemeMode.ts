import { DomainError } from '@domain/shared/DomainError';
import { err, ok, type Result } from '@shared/Result';

/**
 * ThemeMode — which palette the renderer should display.
 *
 * `'system'` defers to the OS-level `prefers-color-scheme`; `'dark'` and
 * `'light'` pin the panel to a specific theme regardless of the system. The
 * value is persisted as a plain string in settings storage, so we parse it
 * back through the Result-shaped constructor on load.
 */
export type ThemeMode = 'system' | 'dark' | 'light';

const VALID_MODES: readonly ThemeMode[] = ['system', 'dark', 'light'] as const;

export class InvalidThemeModeError extends DomainError {
  public readonly code = 'THEME_MODE_INVALID';
  public constructor(value: string) {
    super(`Invalid ThemeMode: "${value}"`);
  }
}

export const ThemeMode = {
  default(): ThemeMode {
    return 'system';
  },
  values(): readonly ThemeMode[] {
    return VALID_MODES;
  },
  create(value: string): Result<ThemeMode, InvalidThemeModeError> {
    return (VALID_MODES as readonly string[]).includes(value)
      ? ok(value as ThemeMode)
      : err(new InvalidThemeModeError(value));
  },
};
