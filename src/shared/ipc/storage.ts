import type { Unsubscribe } from './subscription';

/**
 * IPC contract for storage health: channel names, wire DTOs and the
 * `window.inmemnote.storage` surface. Pure types + constants — see ADR 0005.
 */

export const StorageChannels = {
  /**
   * Renderer asks main which persistence layers are not reaching disk right
   * now: those that fell back to in-memory at boot, plus those whose writes
   * started failing later (ADR 0008).
   */
  StorageStatus: 'storage:status',
  /**
   * Main broadcast: a store newly degraded after boot (a write failed).
   * Carries the full `StorageStatusDTO` snapshot, not a delta.
   */
  StorageChanged: 'storage:changed',
} as const;

/** A persistence layer that can independently degrade. */
export type StoreNameDTO = 'drafts' | 'notes' | 'settings';

/**
 * One store whose writes are not reaching disk — it runs in-memory, or its
 * SQLite writes fail — i.e. what the user writes there is lost on quit.
 * `reason` is the raw error message, shown to the user as a diagnostic hint.
 */
export interface DegradedStoreDTO {
  store: StoreNameDTO;
  reason: string;
}

/**
 * Answer to `storage:status` and payload of `storage:changed`. An empty
 * `degraded` list means "all on disk". The list only ever grows within a
 * process lifetime.
 */
export interface StorageStatusDTO {
  degraded: DegradedStoreDTO[];
}

export interface StorageBridge {
  /**
   * Which stores are not persisting right now (SQLite failed to open, or a
   * later write failed). Non-empty means user data is NOT being saved.
   */
  status(): Promise<StorageStatusDTO>;
  /** Subscribe to "a store degraded after boot" broadcasts (full snapshot). */
  onChanged(handler: (status: StorageStatusDTO) => void): Unsubscribe;
}
