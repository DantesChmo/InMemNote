import { UpdateCheckFailedError } from '@domain/update/errors';
import { err, ok, type Result } from '@shared/Result';

import type { AppVersion } from '@domain/update/AppVersion';
import type { ReleaseGateway } from '@domain/update/ReleaseGateway';
import type { ReleaseInfo } from '@domain/update/ReleaseInfo';

/**
 * Decide whether a newer release than the running app exists.
 *
 * Returns `ok(release)` when the feed's latest version is strictly newer than
 * `current`, `ok(null)` when we're already up to date, and `err(...)` only
 * when the feed itself couldn't be read (offline, rate-limited, malformed
 * JSON). The gateway's exceptions are caught here so being offline is a
 * no-op, not a crash — the caller re-checks on the next interval.
 */
export class CheckForUpdateUseCase {
  public constructor(
    private readonly gateway: ReleaseGateway,
    private readonly current: AppVersion,
  ) {}

  public async execute(): Promise<Result<ReleaseInfo | null, UpdateCheckFailedError>> {
    let latest: ReleaseInfo;
    try {
      latest = await this.gateway.fetchLatest();
    } catch (e) {
      return err(new UpdateCheckFailedError(e instanceof Error ? e.message : String(e)));
    }
    return ok(latest.version.isNewerThan(this.current) ? latest : null);
  }
}
