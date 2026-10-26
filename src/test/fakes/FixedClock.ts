import type { Clock } from '@domain/shared/Clock';

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
