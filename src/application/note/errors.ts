import { DomainError } from '@domain/shared/DomainError';

import type { NoteId } from '@domain/note/NoteId';

export class NoteNotFoundError extends DomainError {
  public readonly code = 'NOTE_NOT_FOUND';
  public constructor(public readonly id: NoteId) {
    super(`Note not found: ${id}`);
  }
}
