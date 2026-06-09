import type { AppSettings } from '@domain/settings/AppSettings';
import type { SettingsRepository } from '@domain/settings/SettingsRepository';

/**
 * In-memory settings repository.
 *
 * Used by unit tests (no SQLite dependency) and as a fallback if the SQLite
 * settings table cannot be created — we'd rather run the app with non-persistent
 * preferences than refuse to launch.
 */
export class InMemorySettingsRepository implements SettingsRepository {
  private current: AppSettings | null = null;

  public async load(): Promise<AppSettings | null> {
    return this.current;
  }

  public async save(settings: AppSettings): Promise<void> {
    this.current = settings;
  }
}
