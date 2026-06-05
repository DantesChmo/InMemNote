import type { DraftId } from './DraftId';

/**
 * Domain events emitted by the Draft aggregate.
 *
 * Why domain events: keep cross-cutting concerns (autosave triggers, telemetry,
 * UI notifications) decoupled from the aggregate itself. The aggregate records
 * what happened; subscribers decide what to do about it.
 *
 * Events are pure value objects — no behavior, no references to infrastructure.
 */

export interface DraftCreated {
  readonly type: 'DraftCreated';
  readonly id: DraftId;
  readonly at: Date;
}

export interface DraftContentChanged {
  readonly type: 'DraftContentChanged';
  readonly id: DraftId;
  readonly at: Date;
}

export interface DraftPinned {
  readonly type: 'DraftPinned';
  readonly id: DraftId;
  readonly at: Date;
}

export interface DraftUnpinned {
  readonly type: 'DraftUnpinned';
  readonly id: DraftId;
  readonly at: Date;
}

export type DraftEvent = DraftCreated | DraftContentChanged | DraftPinned | DraftUnpinned;
