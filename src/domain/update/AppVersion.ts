import { DomainError } from '@domain/shared/DomainError';
import { err, ok, type Result } from '@shared/Result';

/**
 * AppVersion — a semantic version the updater can compare.
 *
 * Two versions flow through the update check: the running app's own version
 * (`app.getVersion()`, i.e. `package.json`'s `version`) and the `tag_name` of
 * the newest GitHub release (`v0.6.0`). Both are strings from the outside
 * world, so we parse them through a Result-shaped factory and compare the
 * parsed numeric triples — never the raw strings, where `"0.10.0" < "0.9.0"`
 * lexicographically and would hide a real update.
 *
 * Scope: `major.minor.patch` only. A leading `v` is tolerated (release tags
 * carry it, `package.json` doesn't). Pre-release / build metadata
 * (`-rc.1`, `+build`) is intentionally ignored for the comparison — we don't
 * ship pre-releases through this channel, and modelling SemVer precedence
 * rules for a case we never hit would be dead complexity.
 */
export class InvalidAppVersionError extends DomainError {
  public readonly code = 'APP_VERSION_INVALID';
  public constructor(value: string) {
    super(`Invalid AppVersion: "${value}"`);
  }
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)/;

export class AppVersion {
  private constructor(
    public readonly major: number,
    public readonly minor: number,
    public readonly patch: number,
  ) {}

  public static create(raw: string): Result<AppVersion, InvalidAppVersionError> {
    const match = SEMVER.exec(raw.trim());
    if (!match) return err(new InvalidAppVersionError(raw));
    return ok(new AppVersion(Number(match[1]), Number(match[2]), Number(match[3])));
  }

  /** Strictly greater than `other` (an equal version is NOT newer). */
  public isNewerThan(other: AppVersion): boolean {
    if (this.major !== other.major) return this.major > other.major;
    if (this.minor !== other.minor) return this.minor > other.minor;
    return this.patch > other.patch;
  }

  public toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }
}
