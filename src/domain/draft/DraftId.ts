import { DomainError } from '@domain/shared/DomainError';
import { err, ok, type Result } from '@shared/Result';

/**
 * DraftId — a branded string.
 *
 * The brand lets the TS compiler distinguish a draft identifier from any other
 * string, even though at runtime it IS a string. This prevents accidentally
 * passing, say, an email or some other entity's id in its place.
 *
 * Construction is only allowed via `DraftId.create(...)` (validation of an
 * externally provided value) or `DraftId.generate()` (fresh id).
 */
declare const DraftIdBrand: unique symbol;
export type DraftId = string & { readonly [DraftIdBrand]: void };

export class InvalidDraftIdError extends DomainError {
  public readonly code = 'DRAFT_ID_INVALID';
  public constructor(value: string) {
    super(`Invalid DraftId: "${value}"`);
  }
}

// Canonical UUID v4 in lowercase hex.
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const DraftId = {
  /** Validate an id coming from the outside world (DB, config, IPC). */
  create(value: string): Result<DraftId, InvalidDraftIdError> {
    if (!UUID_V4_RE.test(value)) {
      return err(new InvalidDraftIdError(value));
    }
    return ok(value as DraftId);
  },

  /**
   * Generate a fresh id.
   *
   * We use the runtime-global `crypto.randomUUID()` (available in Node 16+ and
   * in browsers). The domain layer must not import `node:crypto` directly, so
   * we rely on the global; if it is missing, the environment is broken — we
   * throw (programmer error / wrong runtime, not a domain failure).
   */
  generate(): DraftId {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (!c?.randomUUID) {
      throw new Error('Runtime does not provide crypto.randomUUID');
    }
    return c.randomUUID() as DraftId;
  },
};
