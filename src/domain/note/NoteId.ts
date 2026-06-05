import { DomainError } from '@domain/shared/DomainError';
import { err, ok, type Result } from '@shared/Result';

/**
 * NoteId — branded string for Library notes.
 *
 * Kept separate from DraftId on purpose: a draft id and a note id name
 * different things in the domain. A draft is the scratch buffer; a note is a
 * persisted item in the library. Conflating them would invite a bug where
 * someone passes a stale draft id into a note query.
 */
declare const NoteIdBrand: unique symbol;
export type NoteId = string & { readonly [NoteIdBrand]: void };

export class InvalidNoteIdError extends DomainError {
  public readonly code = 'NOTE_ID_INVALID';
  public constructor(value: string) {
    super(`Invalid NoteId: "${value}"`);
  }
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const NoteId = {
  create(value: string): Result<NoteId, InvalidNoteIdError> {
    if (!UUID_V4_RE.test(value)) return err(new InvalidNoteIdError(value));
    return ok(value as NoteId);
  },

  generate(): NoteId {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (!c?.randomUUID) throw new Error('Runtime does not provide crypto.randomUUID');
    return c.randomUUID() as NoteId;
  },
};
