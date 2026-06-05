/**
 * Result<T, E> — a functional alternative to throwing exceptions across layers.
 *
 * Why: application-layer use-cases must explicitly tell the caller whether the
 * operation failed and why. If we throw, the boundary between an "expected
 * failure" (validation, not-found) and a "real bug" (kaboom) gets blurred,
 * and the presentation layer ends up catching everything indiscriminately.
 *
 * Convention:
 *   - expected domain failures           → return `err(...)`;
 *   - programmer errors / broken invariants → throw — let it bubble up.
 */

export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/** Test helper: unwrap a Result, throwing if it is an Err. */
export const unwrap = <T, E>(r: Result<T, E>): T => {
  if (!r.ok) {
    throw new Error(`Result.unwrap on Err: ${JSON.stringify(r.error)}`);
  }
  return r.value;
};
