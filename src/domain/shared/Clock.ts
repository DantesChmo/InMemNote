/**
 * Clock port.
 *
 * The domain never reads `Date.now()` directly. Use-cases receive a `Clock`
 * implementation and pass `now()` into aggregate methods. In production this
 * wraps the system clock; in tests we inject a frozen/controlled clock so
 * `updatedAt` assertions stay deterministic.
 */
export interface Clock {
  now(): Date;
}
