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

  public async run(_write: () => Promise<void>): Promise<void> {
    throw new Error('not implemented');
  }
}

/** `DraftRepository` whose writes go through `guard`. */
export function guardDraftRepository(_inner: DraftRepository, _guard: WriteGuard): DraftRepository {
  throw new Error('not implemented');
}

/** `NoteRepository` whose writes go through `guard`. */
export function guardNoteRepository(_inner: NoteRepository, _guard: WriteGuard): NoteRepository {
  throw new Error('not implemented');
}

/** `SettingsRepository` whose writes go through `guard`. */
export function guardSettingsRepository(
  _inner: SettingsRepository,
  _guard: WriteGuard,
): SettingsRepository {
  throw new Error('not implemented');
}
