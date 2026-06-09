import type { AppSettings } from './AppSettings';

/**
 * Port for persisting `AppSettings`.
 *
 * The aggregate is a singleton from the storage's point of view (no id), so
 * the interface is plain `load` / `save`. `load` returns `null` for "nothing
 * was ever saved" — that's the first-launch path, and the caller (use-case)
 * decides how to merge with defaults. We don't shovel that decision into the
 * repository because tests want to assert "is the slot empty or not?".
 */
export interface SettingsRepository {
  load(): Promise<AppSettings | null>;
  save(settings: AppSettings): Promise<void>;
}
