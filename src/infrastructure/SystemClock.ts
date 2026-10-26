import type { Clock } from '@domain/shared/Clock';

/** Production `Clock` backed by the runtime's wall clock. */
export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}
