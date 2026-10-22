/**
 * Electron Forge configuration.
 *
 * Purpose: packaging and distribution. The actual dev loop (TS, React, HMR)
 * is handled by the Vite plugin — see `vite.*.config.ts`.
 *
 * We also enable Electron Fuses — runtime flags baked into the binary that
 * disable risky capabilities (`run-as-node`, raw NODE_OPTIONS), enable cookie
 * encryption, etc. Standard hygiene for shipping desktop apps.
 */
import { execFileSync } from 'node:child_process';
import { cp } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';

import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

/**
 * Native modules that `vite-plugin` leaves as `external` AND that Forge does
 * not currently copy into the packaged app on its own. We hand-stamp them
 * (plus their runtime deps) via an `afterCopy` hook. Moving the `.node`
 * files out of asar needs no plugin: since @electron/packager 19 `asar: true`
 * unpacks every `.node` file by default.
 *
 * Walk the closure manually instead of pulling in `flora-colossus`. Since
 * better-sqlite3 13 (N-API + bundled prebuilds) neither package has runtime
 * dependencies — `node-addon-api` is compile-time headers only.
 */
const NATIVE_DEP_CLOSURE = ['better-sqlite3', '@inmemnote/window-events'];

/**
 * Developer ID signing is opt-in, driven by the release workflow
 * (`.github/workflows/release.yml`), which sets these only when the Apple
 * secrets exist. Unset (local builds, and every release so far) → ad-hoc.
 */
const SIGN_IDENTITY = process.env.MACOS_SIGN_IDENTITY || undefined;
const SIGN_KEYCHAIN = process.env.MACOS_SIGN_KEYCHAIN || undefined;

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Inmemnote',
    asar: true,
    appBundleId: 'com.inmemnote.app',
    appCategoryType: 'public.app-category.productivity',
    // The packager signs after `afterCopy` and after the Fuses plugin flips
    // its fuses, so the signature covers the final bytes. Notarization needs
    // hardened runtime on every binary; V8 needs `allow-jit` under it.
    osxSign: SIGN_IDENTITY
      ? {
          identity: SIGN_IDENTITY,
          keychain: SIGN_KEYCHAIN,
          optionsForFile: () => ({
            hardenedRuntime: true,
            entitlements: 'packaging/macos/entitlements.plist',
          }),
        }
      : undefined,
    afterCopy: [
      // @electron/packager 19+ hooks take one args object and may return a
      // promise; the old positional `(buildPath, …, callback)` form is gone.
      async ({ buildPath, platform, arch }) => {
        // better-sqlite3 ships prebuilt binaries for every OS/arch
        // (`prebuilds/<platform>-<arch>.node`); only the target's is loadable,
        // the rest is ~14 MB of dead weight in the bundle.
        const ownPrebuild = `${platform}-${arch}.node`;
        const keep = (path: string): boolean =>
          !path.includes(`${sep}prebuilds${sep}`) || basename(path) === ownPrebuild;

        for (const dep of NATIVE_DEP_CLOSURE) {
          const src = join(process.cwd(), 'node_modules', dep);
          const dest = join(buildPath, 'node_modules', dep);
          // `dereference: true` is load-bearing: `@inmemnote/window-events`
          // is a `file:` dependency, so npm links it into node_modules as a
          // symlink pointing at the checkout. Without dereferencing, `cp`
          // copies the symlink verbatim, asar records it as a link to the
          // build machine's absolute path, and the packaged app crashes at
          // startup with ENOENT on a `/Users/runner/...` path that only ever
          // existed on the CI runner.
          await cp(src, dest, { recursive: true, dereference: true, filter: keep });
        }
      },
    ],
  },
  rebuildConfig: {},
  hooks: {
    // Final ad-hoc re-sign of the whole .app bundle.
    //
    // This is load-bearing for distribution: without a *valid* signature
    // macOS Gatekeeper reports a downloaded build as "damaged" (a hard block
    // you can't click past) instead of the softer "unidentified developer"
    // prompt that a right-click → Open / "Open Anyway" can bypass.
    //
    // Two earlier steps each leave the signature broken:
    //   1. `afterCopy` writes native modules into Contents/Resources/app
    //      *after* the packager's ad-hoc sign, so the bundle seal is stale.
    //   2. The Fuses plugin rewrites the Electron binary; its
    //      `resetAdHocDarwinSignature` re-signs only that Mach-O, leaving the
    //      bundle's Info.plist "not bound" (verified with `codesign --verify`).
    //
    // A config-level `postPackage` hook runs *after* all plugin hooks (Forge
    // triggers plugin hooks first, then the config hook), i.e. after the Fuses
    // plugin — so this is the last touch and reseals the entire bundle,
    // Info.plist included. It's ad-hoc (`--sign -`), so still not notarized:
    // good enough for local/side-loaded installs, not for frictionless
    // distribution (that needs an Apple Developer ID — see docs/RELEASING.md).
    //
    // Skipped when signing with Developer ID: the packager has already
    // signed the final bundle, and an ad-hoc pass would throw that away.
    postPackage: async (_forgeConfig, { platform, outputPaths }) => {
      if (platform !== 'darwin' || SIGN_IDENTITY) return;
      for (const outputPath of outputPaths) {
        const appPath = join(outputPath, 'Inmemnote.app');
        execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
          stdio: 'inherit',
        });
      }
    },
  },
  makers: [new MakerDMG({}, ['darwin']), new MakerZIP({}, ['darwin'])],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/infrastructure/electron/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/infrastructure/electron/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      // Flipping fuses rewrites the Electron binary and invalidates the
      // packager's ad-hoc signature. This re-signs that Mach-O so it isn't
      // left broken — but it is NOT sufficient on its own: it signs only the
      // binary, leaving the bundle's Info.plist unbound. The whole bundle is
      // resealed afterwards by the `postPackage` hook above, which is what
      // actually keeps Gatekeeper from flagging the app as "damaged".
      // With Developer ID the packager signs everything after the fuses
      // flip, so the ad-hoc pass would only be overwritten.
      resetAdHocDarwinSignature: !SIGN_IDENTITY,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      // Two fuses below are disabled while we copy native deps into the bundle
      // via `afterCopy`: that step mutates files inside the .app, which breaks
      // the asar integrity hash and prevents OnlyLoadAppFromAsar from finding
      // anything to load. For a signed/notarized prod release we'd rebake
      // these — see docs/TZ.md "Открытые вопросы".
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};

export default config;
