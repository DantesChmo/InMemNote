import type { Clock } from '@domain/shared/Clock';

/** Production `Clock` backed by the runtime's wall clock. */
export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}

/**
 * `Clock` for tests. The current instant can be advanced by hand so we can
 * assert timestamp transitions without sprinkling `setTimeout` everywhere.
 */
export class FixedClock implements Clock {
  public constructor(private current: Date) {}
  public now(): Date {
    return this.current;
  }
  public set(next: Date): void {
    this.current = next;
  }
}
