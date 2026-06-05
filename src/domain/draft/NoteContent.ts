import { DomainError } from '@domain/shared/DomainError';
import { err, ok, type Result } from '@shared/Result';

/**
 * NoteContent — a value object wrapping the draft text.
 *
 * Why factor it out: text is not "just a string". It has invariants (length
 * cap), behavior (isEmpty, equals), and we don't want that logic scattered
 * across the presentation layer.
 *
 * V1 invariants:
 *   - max length = `MAX_LENGTH` (1M chars; guards against pasting gigantic
 *     payloads that would stall both the editor and SQLite at once);
 *   - an empty string IS valid — that's the "freshly opened Draft" state.
 */

export class NoteContentTooLargeError extends DomainError {
  public readonly code = 'NOTE_CONTENT_TOO_LARGE';
  public constructor(actual: number, max: number) {
    super(`NoteContent length ${actual} exceeds maximum ${max}`);
  }
}

export class NoteContent {
  public static readonly MAX_LENGTH = 1_000_000;

  private constructor(public readonly value: string) {}

  public static create(value: string): Result<NoteContent, NoteContentTooLargeError> {
    if (value.length > NoteContent.MAX_LENGTH) {
      return err(new NoteContentTooLargeError(value.length, NoteContent.MAX_LENGTH));
    }
    return ok(new NoteContent(value));
  }

  /** Convenience constructor for an empty draft. Cannot fail. */
  public static empty(): NoteContent {
    return new NoteContent('');
  }

  public isEmpty(): boolean {
    // Treat whitespace-only as empty too, otherwise auto-save accumulates
    // junk "blank" drafts whenever the user opens the panel by accident.
    return this.value.trim().length === 0;
  }

  public equals(other: NoteContent): boolean {
    return this.value === other.value;
  }
}
