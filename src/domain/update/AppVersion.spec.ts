import { unwrap } from '@shared/Result';
import { describe, expect, it } from 'vitest';

import { AppVersion } from './AppVersion';

const v = (raw: string): AppVersion => unwrap(AppVersion.create(raw));

describe('AppVersion', () => {
  it('parses a plain semver string', () => {
    const parsed = v('1.2.3');
    expect([parsed.major, parsed.minor, parsed.patch]).toEqual([1, 2, 3]);
  });

  it('tolerates a leading v (release tags carry it)', () => {
    expect(v('v0.5.0').toString()).toBe('0.5.0');
  });

  it('ignores pre-release / build metadata for parsing', () => {
    expect(v('0.6.0-rc.1').toString()).toBe('0.6.0');
  });

  it('rejects a non-semver string', () => {
    const result = AppVersion.create('not-a-version');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('APP_VERSION_INVALID');
  });

  it('compares numerically, not lexicographically', () => {
    // The bug this guards: "0.10.0" < "0.9.0" as strings.
    expect(v('0.10.0').isNewerThan(v('0.9.0'))).toBe(true);
  });

  it('treats an equal version as NOT newer', () => {
    expect(v('0.5.0').isNewerThan(v('0.5.0'))).toBe(false);
  });

  it('orders by major, then minor, then patch', () => {
    expect(v('2.0.0').isNewerThan(v('1.9.9'))).toBe(true);
    expect(v('1.3.0').isNewerThan(v('1.2.9'))).toBe(true);
    expect(v('1.2.4').isNewerThan(v('1.2.3'))).toBe(true);
    expect(v('1.2.3').isNewerThan(v('1.2.4'))).toBe(false);
  });
});
