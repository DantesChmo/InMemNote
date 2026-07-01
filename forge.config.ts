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
import { cp } from 'node:fs/promises';
import { join } from 'node:path';

import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

/**
 * Native modules that `vite-plugin` leaves as `external` AND that Forge does
 * not currently copy into the packaged app on its own. We hand-stamp them
 * (plus their runtime deps) via an `afterCopy` hook, then let
 * `AutoUnpackNativesPlugin` move the resulting `.node` files out of asar.
 *
 * Walk the closure manually instead of pulling in `flora-colossus` — three
 * tiny packages don't justify another dev dependency.
 */
const NATIVE_DEP_CLOSURE = [
  'better-sqlite3',
  'bindings',
  'file-uri-to-path',
  '@inmemnote/window-events',
];

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Inmemnote',
    asar: true,
    appBundleId: 'com.inmemnote.app',
    appCategoryType: 'public.app-category.productivity',
    afterCopy: [
      async (buildPath, _electronVersion, _platform, _arch, callback) => {
        try {
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
            await cp(src, dest, { recursive: true, dereference: true });
          }
          callback();
        } catch (e) {
          callback(e as Error);
        }
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerDMG({}, ['darwin']),
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
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
      // Flipping fuses rewrites the Electron binary, which invalidates the
      // ad-hoc signature the packager applies on Apple Silicon. A broken
      // signature makes Gatekeeper report the app as "damaged" (a hard block)
      // instead of the softer "unidentified developer" prompt. Re-applying an
      // ad-hoc signature after the flip keeps the signature valid, so an
      // unsigned/un-notarized build can still be opened via right-click → Open
      // (or System Settings → Privacy & Security → "Open Anyway").
      resetAdHocDarwinSignature: true,
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
