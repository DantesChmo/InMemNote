import type { AppSettings } from '@domain/settings/AppSettings';
import type { SettingsRepository } from '@domain/settings/SettingsRepository';

/**
 * Test fake of `SettingsRepository` for use-case specs (ADR 0007). Starts
 * empty (`load()` → `null`), like a fresh install.
 */
export class FakeSettingsRepository implements SettingsRepository {
  private current: AppSettings | null = null;

  public async load(): Promise<AppSettings | null> {
    return this.current;
  }

  public async save(settings: AppSettings): Promise<void> {
    this.current = settings;
  }
}
