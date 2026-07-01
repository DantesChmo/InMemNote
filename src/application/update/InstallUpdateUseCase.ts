import { UpdateInstallFailedError } from '@domain/update/errors';
import { err, ok, type Result } from '@shared/Result';

import type { ReleaseInfo } from '@domain/update/ReleaseInfo';
import type { UpdateInstaller } from '@domain/update/UpdateInstaller';

/**
 * Apply a previously-discovered release.
 *
 * On success the installer quits the app to let a detached helper swap the
 * bundle, so `ok(void)` is really only observed in tests. A thrown installer
 * error (download failed, helper couldn't spawn) becomes an
 * `UPDATE_INSTALL_FAILED` — surfaced to the user, who explicitly asked for it.
 */
export class InstallUpdateUseCase {
  public constructor(private readonly installer: UpdateInstaller) {}

  public async execute(release: ReleaseInfo): Promise<Result<void, UpdateInstallFailedError>> {
    try {
      await this.installer.install(release);
      return ok(undefined);
    } catch (e) {
      return err(new UpdateInstallFailedError(e instanceof Error ? e.message : String(e)));
    }
  }
}
