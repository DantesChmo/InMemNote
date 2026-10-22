# ADR 0002 — Signing-free self-updater instead of Squirrel

- **Status**: Accepted
- **Date**: 2026-07-01 (V2.3; recorded retroactively on 2026-10-22)
- **Related**: `docs/TZ.md` §4d and decision log §5; `CLAUDE.md` §2
  (auto-update note)

## Context

V2.3 needs the installed app to update itself. The stack in `CLAUDE.md` §2
originally named `update-electron-app`, whose engine on macOS is
Squirrel.Mac. Squirrel refuses to apply an update unless the new bundle
carries a valid Developer ID signature that matches the running one.

The project deliberately has no Apple Developer ID. Releases are
ad-hoc-signed DMGs published by the CI `build` job to GitHub Releases, and
the documented install path is `curl … scripts/install.sh | bash`: `curl`
does not set `com.apple.quarantine`, so Gatekeeper never blocks the
un-notarized app. Hard constraints from `CLAUDE.md` §1: no backend, no
accounts, no telemetry.

Options considered:

1. **Apple Developer ID + notarization + Squirrel** (`update-electron-app`).
   Standard path, but $99/year plus certificate and notarization management
   in CI. Rejected on cost and operational weight.
2. **Notify-only banner** linking to the release page. Cheap, but the user
   still installs by hand — and a browser download brings back the
   quarantine prompt the `curl` installer exists to avoid. Rejected.
3. **In-house updater that replays `install.sh` from inside the app.**

## Decision

Option 3. The app updates itself without Squirrel and without a signature
check:

- **Feed** — the GitHub Release that CI already publishes.
  `GithubReleaseGateway` reads the anonymous `/releases/latest` API and
  resolves the stable `Inmemnote-macos-arm64.dmg` asset (falling back to the
  `/latest/download/` URL). No server of our own.
- **Detection** — `CheckForUpdateUseCase` compares versions numerically
  (`AppVersion`) and treats a feed failure as a soft `Result` error, so
  being offline is never user-visible. Main checks 8 s after launch and
  every 6 h; the Library window also checks on mount.
- **Install** — `DmgSelfUpdater` streams the DMG (reporting progress),
  writes a detached `/bin/bash` helper, spawns it un-tethered and quits. The
  helper waits for the app's PID to exit, mounts the DMG, replaces
  `/Applications/Inmemnote.app`, detaches, strips quarantine and relaunches.
  `cp` does not quarantine, so the relaunch opens without a Gatekeeper
  prompt.
- **Shape** — ports `ReleaseGateway` and `UpdateInstaller` in
  `src/domain/update/`; use-cases in `src/application/update/`; adapters in
  `src/infrastructure/update/`; `UpdateBanner` in the Library window.
- **Tests** — under `INMEMNOTE_E2E=1` the gateway is a fail-soft stub and the
  timers are off, so the E2E suite stays offline and never self-replaces.

## Consequences

- Updates cost nothing to run and keep the "no backend" promise.
- The app does not verify the downloaded bundle's authenticity beyond
  HTTPS to GitHub. Trust is anchored in the GitHub repository and its CI,
  the same trust the `curl` installer already asks for.
- The install target is hard-coded to `/Applications/Inmemnote.app`. A copy
  installed elsewhere is not updated in place.
- The helper replays shell steps (`hdiutil`, `rm -rf` + `cp -R`, `xattr`,
  `open`). Any change to `scripts/install.sh` or the release asset name must
  be mirrored in `src/infrastructure/update/` (`config.ts` keeps the shared
  constants in one place).
- The install flow has no Playwright coverage; banner and state machine are
  covered by component and slice tests.
- `update-electron-app` became dead weight. It is still listed in
  `package.json` and is slated for removal in a dedicated dependency commit.
- If the project ever obtains a Developer ID, this ADR should be revisited
  and superseded rather than edited.
