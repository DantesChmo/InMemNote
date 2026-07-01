import type { ReleaseInfo } from './ReleaseInfo';

/**
 * Port for applying an update.
 *
 * The macOS implementation downloads the `.dmg`, hands the swap-and-relaunch
 * off to a detached helper, and quits the app — so a successful `install`
 * never actually returns (the process is gone). It resolves only in tests /
 * on the error path. Throws if the download or helper hand-off fails before
 * the quit.
 */
export interface UpdateInstaller {
  install(release: ReleaseInfo): Promise<void>;
}
