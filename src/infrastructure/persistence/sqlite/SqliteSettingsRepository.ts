import {
  AppSettingsParse,
  type AppSettings,
  type AppSettingsPlain,
} from '@domain/settings/AppSettings';
import Database from 'better-sqlite3';

import type { SettingsRepository } from '@domain/settings/SettingsRepository';

/**
 * SQLite-backed `SettingsRepository`.
 *
 * Lives in the same db file as drafts and notes. Schema is key-value rather
 * than column-per-field so that adding a new preference later is a runtime
 * insert, not a `ALTER TABLE` migration the user has to live through. Each
 * row is `(key, value)` where `value` is the JSON serialization of that one
 * field — primitive strings still live as quoted JSON to keep the read path
 * uniform.
 *
 * Why JSON-per-row instead of one big JSON blob in a single row:
 *   - A corrupted/legacy entry in one field doesn't kill the whole settings
 *     load; we can selectively fall back to the default for that field.
 *   - We can write a single field via `INSERT … ON CONFLICT` without taking a
 *     read-then-write lock on the entire settings blob.
 */
export class SqliteSettingsRepository implements SettingsRepository {
  private readonly db: Database.Database;
  private readonly readStmt: Database.Statement<[]>;
  private readonly upsertStmt: Database.Statement<[string, string]>;

  public constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.readStmt = this.db.prepare('SELECT key, value FROM settings');
    this.upsertStmt = this.db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
  }

  public async load(): Promise<AppSettings | null> {
    const rows = this.readStmt.all() as { key: string; value: string }[];
    if (rows.length === 0) return null;

    const plain: AppSettingsPlain = {};
    for (const { key, value } of rows) {
      const parsed = safeJsonParse(value);
      if (parsed === undefined) continue;
      assignField(plain, key, parsed);
    }

    const result = AppSettingsParse.fromPlain(plain);
    if (!result.ok) {
      console.warn(
        `Settings on disk failed validation (${result.error.message}); falling back to defaults.`,
      );
      return null;
    }
    return result.value;
  }

  public async save(settings: AppSettings): Promise<void> {
    const plain = AppSettingsParse.toPlain(settings);
    // One transaction so a crash mid-write can't leave the row set in a
    // half-updated state.
    const tx = this.db.transaction(() => {
      this.upsertStmt.run('themeMode', JSON.stringify(plain.themeMode));
      this.upsertStmt.run('language', JSON.stringify(plain.language));
      this.upsertStmt.run('palette', JSON.stringify(plain.palette));
      this.upsertStmt.run('openDraftHotkey', JSON.stringify(plain.openDraftHotkey));
    });
    tx();
  }

  public close(): void {
    this.db.close();
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Map a stored row into the corresponding `AppSettingsPlain` slot. Unknown
 * keys are tolerated (forward-compat: a row from a future schema version
 * just gets ignored).
 */
function assignField(plain: AppSettingsPlain, key: string, value: unknown): void {
  switch (key) {
    case 'themeMode':
      if (typeof value === 'string') plain.themeMode = value;
      return;
    case 'language':
      if (typeof value === 'string') plain.language = value;
      return;
    case 'palette':
      if (isStringRecord(value)) plain.palette = value;
      return;
    case 'openDraftHotkey':
      if (typeof value === 'string') plain.openDraftHotkey = value;
      return;
    default:
      return;
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string');
}
