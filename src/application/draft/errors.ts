import { DomainError } from '@domain/shared/DomainError';

import type { DraftId } from '@domain/draft/DraftId';

/**
 * "Draft with this id doesn't exist".
 *
 * Lives in `application/` rather than `domain/` because it describes a use-case
 * outcome, not a domain rule per se: at the aggregate level there's no such
 * thing as "missing" — there's nothing TO miss until the repository got asked.
 */
export class DraftNotFoundError extends DomainError {
  public readonly code = 'DRAFT_NOT_FOUND';
  public constructor(public readonly id: DraftId) {
    super(`Draft not found: ${id}`);
  }
}
