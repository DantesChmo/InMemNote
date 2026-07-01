import { DomainError } from '@domain/shared/DomainError';

/**
 * The update check couldn't reach or parse the release feed. This is a
 * soft failure — the UI stays silent and we retry on the next interval;
 * being offline is not an error the user needs to see.
 */
export class UpdateCheckFailedError extends DomainError {
  public readonly code = 'UPDATE_CHECK_FAILED';
  public constructor(cause: string) {
    super(`Update check failed: ${cause}`);
  }
}

/**
 * The download or helper hand-off failed before the app could relaunch. This
 * one IS surfaced — the user explicitly asked to update and it didn't happen.
 */
export class UpdateInstallFailedError extends DomainError {
  public readonly code = 'UPDATE_INSTALL_FAILED';
  public constructor(cause: string) {
    super(`Update install failed: ${cause}`);
  }
}
