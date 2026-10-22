/**
 * IPC contract for storage health: channel names, wire DTOs and the
 * `window.inmemnote.storage` surface. Pure types + constants — see ADR 0005.
 */

export const StorageChannels = {
  /**
   * Renderer asks main which persistence layers fell back to in-memory at
   * boot. The answer is fixed for the process lifetime (the container is
   * built once), so there is no broadcast counterpart — a pull is enough.
   */
  StorageStatus: 'storage:status',
} as const;

/** A persistence layer that can independently fall back to in-memory. */
export type StoreNameDTO = 'drafts' | 'notes' | 'settings';

/**
 * One repository that failed to open SQLite and is running in-memory —
 * i.e. everything written to it is lost on quit. `reason` is the raw error
 * message, shown to the user as a diagnostic hint.
 */
export interface DegradedStoreDTO {
  store: StoreNameDTO;
  reason: string;
}

/** Answer to `storage:status`. An empty `degraded` list means "all on disk". */
export interface StorageStatusDTO {
  degraded: DegradedStoreDTO[];
}

export interface StorageBridge {
  /**
   * Which repositories fell back to in-memory at boot (SQLite failed to
   * open). Non-empty means user data is NOT being persisted.
   */
  status(): Promise<StorageStatusDTO>;
}
