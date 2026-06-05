import { NoteId } from './NoteId';

import type { NoteContent } from '@domain/draft/NoteContent';


/**
 * Note — the aggregate root for a library item.
 *
 * Structurally similar to `DraftNote`, but separated because the two have
 * different lifecycles: there are many notes (one per saved item), exactly one
 * draft (the current scratch buffer). Sharing a class would force one set of
 * invariants to fit both, which gets ugly fast.
 *
 * `title()` is computed from the first non-empty line, with leading markdown
 * markers stripped. We expose it as a method so callers don't accidentally
 * cache a stale value after `changeContent`.
 */
export class Note {
  private constructor(
    public readonly id: NoteId,
    private _content: NoteContent,
    private _pinned: boolean,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  public static create(content: NoteContent, now: Date): Note {
    return new Note(NoteId.generate(), content, false, now, now);
  }

  public static restore(props: {
    id: NoteId;
    content: NoteContent;
    pinned: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Note {
    return new Note(
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
   * Derive a one-line title from the body.
   *
   * The library list shows a title even before the user types anything
   * resembling a heading. We strip the most common markdown leaders (`#`,
   * `>`, list bullets, ordered prefixes) before taking the first non-empty
   * line. If everything is blank, fall back to a stable placeholder so the
   * list never shows a row with no label at all.
   */
  public title(): string {
    const lines = this._content.value.split('\n');
    for (const raw of lines) {
      const stripped = raw
        .replace(/^#{1,6}\s+/, '')
        .replace(/^>\s+/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .trim();
      if (stripped) return stripped;
    }
    return 'Без заголовка';
  }

  // ---------- Commands ----------

  public changeContent(next: NoteContent, now: Date): void {
    if (this._content.equals(next)) return;
    this._content = next;
    this._updatedAt = now;
  }

  public pin(now: Date): void {
    if (this._pinned) return;
    this._pinned = true;
    this._updatedAt = now;
  }

  public unpin(now: Date): void {
    if (!this._pinned) return;
    this._pinned = false;
    this._updatedAt = now;
  }
}
