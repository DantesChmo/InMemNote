# ADR 0006 — DMG-first distribution, with Homebrew and `curl` as extras

- **Status**: Accepted
- **Date**: 2026-10-22
- **Related**: `docs/RELEASING.md`; ADR 0002 (signing-free self-updater);
  the SuperLaunchpad release setup, which this mirrors

## Context

Until now the documented way to install Inmemnote was
`curl … scripts/install.sh | bash`. `curl` sets no `com.apple.quarantine`
flag, so the ad-hoc-signed app opened without a Gatekeeper prompt. The DMG
was a "by hand" fallback that needed an `xattr` command. Releases were built
by a `build` job at the end of `ci.yml`, and published only under the stable
asset name `Inmemnote-macos-arm64.dmg`.

The maintainer's other macOS app, SuperLaunchpad, ships differently: the
versioned DMG from the Releases page is the main channel, a Homebrew cask is
the second, and first launch goes through **Open Anyway**. It has a separate
`release.yml` that turns on Developer ID signing and notarization by itself
once the Apple secrets exist. The maintainer asked for one policy across both
projects, with the DMG first.

Piping a script from the internet into `bash` is also a habit many users
(rightly) avoid, and it hides what gets installed.

## Decision

- **The DMG is the primary channel.** The README leads with "download
  `Inmemnote-X.Y.Z-arm64.dmg`, drag to Applications, allow with Open Anyway".
- **Homebrew is second**: `brew install --cask dantesChmo/tap/inmemnote`.
  The cask template lives in `packaging/homebrew/inmemnote.rb`;
  `homebrew.yml` fills in version and checksum after each release and pushes
  it to the shared tap. It declares `auto_updates true`, because the in-app
  updater owns upgrades.
- **The `curl` installer stays as an alternative** for people who would
  rather skip Open Anyway. It is no longer the headline.
- **Releases move to `release.yml`**, triggered by `v*` tags (or run by hand
  without publishing). It calls `ci.yml` as a reusable workflow, so a release
  still never ships without a green test run. `ci.yml` no longer triggers on
  tags.
- **The version comes from the tag**, stamped into `package.json` at build
  time. Tags with a suffix (`-rc1`) become prereleases, which
  `releases/latest` ignores.
- **Each release carries the DMG under two names**: the versioned one, and
  the stable `Inmemnote-macos-arm64.dmg`, which every installed updater and
  `install.sh` fetch.
- **Signing is optional and automatic**, as in SuperLaunchpad: with all seven
  Apple secrets, `forge.config.ts` gets `MACOS_SIGN_IDENTITY` and the
  packager signs with Developer ID plus hardened runtime
  (`packaging/macos/entitlements.plist`), and the workflow notarizes and
  staples the DMG. Without them the build is ad-hoc, as before.

## Consequences

- First launch from the DMG or Homebrew now needs one trip to System
  Settings. Updates installed by the in-app updater never do, since it
  downloads without quarantine (ADR 0002).
- The stable asset name is permanent: renaming or dropping it would strand
  every installed copy. `docs/RELEASING.md` says so in bold.
- The signed path mirrors SuperLaunchpad but has never run for this app.
  Electron with hardened runtime may need more entitlements; the first
  signed release should be treated as a test.
- If Developer ID signing is turned on, ADR 0002's reason for avoiding
  Squirrel goes away. That ADR should then be revisited, not this one.
- Homebrew publishing needs a `HOMEBREW_TAP_TOKEN` secret in this
  repository; without it the job is skipped and the release is unaffected.
