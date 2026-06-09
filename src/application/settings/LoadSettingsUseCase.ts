import { AppSettings } from '@domain/settings/AppSettings';

import type { SettingsRepository } from '@domain/settings/SettingsRepository';

/**
 * Read the persisted user preferences.
 *
 * Cannot fail: a missing row is interpreted as "first launch", which yields
 * `AppSettings.default()`. A row that fails parsing in the repository is also
 * surfaced as defaults (with a logged warning) — we'd rather start with sane
 * preferences than refuse to open the Library because some hex code was
 * malformed.
 */
export class LoadSettingsUseCase {
  public constructor(private readonly repo: SettingsRepository) {}

  public async execute(): Promise<AppSettings> {
    const stored = await this.repo.load();
    return stored ?? AppSettings.default();
  }
}
