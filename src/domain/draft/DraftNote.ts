import { DraftId } from './DraftId';
import { NoteContent } from './NoteContent';

import type { DraftEvent } from './events';

/**
 * DraftNote — the aggregate root for a single quick note.
 *
 * Why it owns its state mutations: keeping `content`/`pinned` setters here is
 * the only way to guarantee invariants (timestamps update together with
 * content, events get recorded). Bypassing the aggregate to set fields
 * directly is forbidden — anything that needs a change goes through a method.
 *
 * Time is injected (`now: Date`) rather than read from `Date.now()` so the
 * aggregate stays deterministic and testable. The application layer is
 * responsible for supplying the current time.
 */
export class DraftNote {
  private readonly _events: DraftEvent[] = [];

  private constructor(
    public readonly id: DraftId,
    private _content: NoteContent,
    private _pinned: boolean,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  // ---------- Factory methods ----------

  /** Brand-new draft, created by the user pressing the global hotkey. */
  public static create(now: Date): DraftNote {
    const id = DraftId.generate();
    const draft = new DraftNote(id, NoteContent.empty(), false, now, now);
    draft._events.push({ type: 'DraftCreated', id, at: now });
    return draft;
  }

  /** Rehydrate from persistence. Does NOT emit any events. */
  public static restore(props: {
    id: DraftId;
    content: NoteContent;
    pinned: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): DraftNote {
    return new DraftNote(
      props.id,
      props.content,
      props.pinned,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ---------- Queries ----------

  public get content(): NoteContent {
    return this._content;
  }
  public get pinned(): boolean {
    return this._pinned;
  }
  public get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Pull-and-clear pattern: callers consume events exactly once after the
   * application transaction commits. Mutating the returned array does not
   * affect the aggregate.
   */
  public pullEvents(): readonly DraftEvent[] {
    const out = [...this._events];
    this._events.length = 0;
    return out;
  }

  // ---------- Commands ----------

  public changeContent(next: NoteContent, now: Date): void {
    if (this._content.equals(next)) return; // no-op guard: keeps `updatedAt` honest
    this._content = next;
    this._updatedAt = now;
    this._events.push({ type: 'DraftContentChanged', id: this.id, at: now });
  }

  public pin(now: Date): void {
    if (this._pinned) return;
    this._pinned = true;
    this._updatedAt = now;
    this._events.push({ type: 'DraftPinned', id: this.id, at: now });
  }

  public unpin(now: Date): void {
    if (!this._pinned) return;
    this._pinned = false;
    this._updatedAt = now;
    this._events.push({ type: 'DraftUnpinned', id: this.id, at: now });
  }
}
