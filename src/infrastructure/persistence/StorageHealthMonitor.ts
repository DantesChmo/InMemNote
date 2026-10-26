/**
 * Storage health of the running process — which stores are NOT getting
 * the user's writes onto disk, and why.
 *
 * A store becomes degraded in two ways: SQLite fails to open at boot (the
 * composition root falls back to an in-memory repository), or a write to an
 * open database fails later (disk full, file deleted — see `WriteGuard`).
 * Either way the user must be told, because the loss is otherwise silent
 * (bug #03). Degradation is sticky for the process lifetime: a write that
 * failed is not retried, so a later success would not bring that data back.
 */

/** A persistence layer that can independently degrade. */
export type StoreName = 'drafts' | 'notes' | 'settings';

/** A store whose writes are not reaching disk, with the error message. */
export interface StorageDegradation {
  store: StoreName;
  reason: string;
}

/** Read-only view of the monitor handed to the IPC layer. */
export interface StorageHealth {
  /** Degraded stores in the order they degraded. Empty = everything is on disk. */
  readonly degraded: readonly StorageDegradation[];
  /**
   * Called after a store newly degrades. Never called for a store that is
   * already degraded. Returns an unsubscribe function.
   */
  onChange(listener: () => void): () => void;
}

export class StorageHealthMonitor implements StorageHealth {
  private entries: readonly StorageDegradation[] = [];
  private readonly listeners = new Set<() => void>();

  public get degraded(): readonly StorageDegradation[] {
    return this.entries;
  }

  /**
   * Record that `store` no longer persists. The first reason for a store
   * wins; later failures of the same store are ignored (no repeated
   * notifications for every autosave that fails the same way).
   */
  public markDegraded(store: StoreName, error: unknown): void {
    if (this.entries.some((d) => d.store === store)) return;
    // A fresh array each time, so a snapshot handed out earlier never changes.
    this.entries = [...this.entries, { store, reason: errorMessage(error) }];
    for (const listener of this.listeners) listener();
  }

  public onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
