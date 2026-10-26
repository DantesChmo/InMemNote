import { describe, expect, it } from 'vitest';

import { err, ok, unwrap } from './Result';

describe('Result', () => {
  it('unwrap returns the value of an Ok', () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it('unwrap on an Err throws with the error serialised, so a failing spec names the cause', () => {
    expect(() => unwrap(err({ code: 'BOOM' }))).toThrow(/unwrap on Err.*BOOM/);
  });
});
