import { AppSettingsParse, type AppSettings, type AppSettingsParseError } from '@domain/settings/AppSettings';
import { ok, type Result } from '@shared/Result';

import type { AppSettingsPlain } from '@domain/settings/AppSettings';
import type { SettingsRepository } from '@domain/settings/SettingsRepository';

/**
 * Save user preferences coming from the renderer.
 *
 * Input shape is the plain transport form (`AppSettingsPlain`) so the popup
 * can ship an arbitrary subset of fields without first reconstructing every
 * value object. The use-case re-validates through `AppSettingsParse`, persists
 * on success, and returns the canonical `AppSettings` so the caller can
 * broadcast the new state to the rest of the app.
 *
 * On a validation error we DO NOT touch the repository — the existing row on
 * disk stays as it was. Partial writes ("theme saved, hotkey rejected") are
 * not allowed; the popup either commits the whole form or nothing.
 */
export class UpdateSettingsUseCase {
  public constructor(private readonly repo: SettingsRepository) {}

  public async execute(
    incoming: AppSettingsPlain,
  ): Promise<Result<AppSettings, AppSettingsParseError>> {
    const parsed = AppSettingsParse.fromPlain(incoming);
    if (!parsed.ok) return parsed;
    await this.repo.save(parsed.value);
    return ok(parsed.value);
  }

  /**
   * Persist an already-validated aggregate. Useful for migrations and
   * "reset to defaults" — both produce an `AppSettings`, not a plain payload.
   */
  public async executeDirect(settings: AppSettings): Promise<AppSettings> {
    await this.repo.save(settings);
    return settings;
  }
}
