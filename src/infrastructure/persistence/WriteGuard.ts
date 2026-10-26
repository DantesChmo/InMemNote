import type { StorageHealthMonitor, StoreName } from './StorageHealthMonitor';
import type { DraftRepository } from '@domain/draft/DraftRepository';
import type { NoteRepository } from '@domain/note/NoteRepository';
import type { SettingsRepository } from '@domain/settings/SettingsRepository';

/**
 * Write-failure reporting for the SQLite repositories (ADR 0008).
 *
 * A write that fails after the database opened fine (disk full, file
 * deleted, connection closed on quit) used to reach only the IPC caller as
 * a rejected promise — the renderer logs it and the user sees nothing. The
 * guard runs every write, logs a failure loudly in main, marks the store
 * degraded so the "not saved" warning appears, and rethrows so callers
 * still see the error. Reads are not guarded: they don't lose data.
 */
export class WriteGuard {
  public constructor(
    private readonly store: StoreName,
    private readonly health: StorageHealthMonitor,
    /** Post-write check; throwing means the write did not really persist. */
    private readonly verify: () => void = () => undefined,
  ) {}

  public async run(write: () => Promise<void>): Promise<void> {
    try {
      await write();
      this.verify();
    } catch (e) {
      console.error(`[storage] ${this.store} write failed; it is not on disk.`, e);
      this.health.markDegraded(this.store, e);
      throw e;
    }
  }
}

/** `DraftRepository` whose writes go through `guard`. */
export function guardDraftRepository(inner: DraftRepository, guard: WriteGuard): DraftRepository {
  return {
    findById: (id) => inner.findById(id),
    findLatest: () => inner.findLatest(),
    save: (note) => guard.run(() => inner.save(note)),
    delete: (id) => guard.run(() => inner.delete(id)),
  };
}

/** `NoteRepository` whose writes go through `guard`. */
export function guardNoteRepository(inner: NoteRepository, guard: WriteGuard): NoteRepository {
  return {
    list: (filter) => inner.list(filter),
    findById: (id) => inner.findById(id),
    search: (query) => inner.search(query),
    save: (note) => guard.run(() => inner.save(note)),
    delete: (id) => guard.run(() => inner.delete(id)),
  };
}

/** `SettingsRepository` whose writes go through `guard`. */
export function guardSettingsRepository(
  inner: SettingsRepository,
  guard: WriteGuard,
): SettingsRepository {
  return {
    load: () => inner.load(),
    save: (settings) => guard.run(() => inner.save(settings)),
  };
}
