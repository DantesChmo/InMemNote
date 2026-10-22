# Postmortem — Self-update can delete the app (bug #04)

**Date**: 2026-10-22 · **Severity**: major (the user can end up with no app) · **Surface**: build / autoupdate

## What happened

Found in review, not reported by a user. Two independent ways for "Update &
restart" to leave the user without a working app:

1. The detached helper ran `rm -rf /Applications/Inmemnote.app` and then
   `cp -R` from the mounted DMG. If the copy failed (disk full, permissions,
   a damaged image), the old app was already gone and `set -e` stopped the
   script before the relaunch. `scripts/install.sh` had the same
   `rm -rf` → `cp -R` sequence.
2. `nodeSpawnDetached` called `spawn(...).unref()` and returned at once.
   `spawn` reports a failed start (ENOENT, EACCES) through an asynchronous
   `error` event, which nobody listened to, and `install()` called `quit()`
   immediately. The app closed and nothing relaunched it.

## Root cause

The helper was written as a straight copy of the happy path of
`install.sh`, and `install.sh` itself never considered a failure after the
delete. On the Node side, `spawn` was treated as synchronous.

## Fix

- Helper and `install.sh`: copy the new bundle to `.Inmemnote.app.new-$$`
  inside the install directory (same volume, so `mv` is an atomic rename),
  check it has `Contents/Info.plist`, rename the old bundle to
  `.Inmemnote.app.old-$$`, rename the new one into place, remove the backup.
  Every step goes through `fail`, which removes the staging copy, puts the
  backup back and (helper only) relaunches the old version. The helper no
  longer uses `set -e`, so no failure can skip the rollback.
- `spawnDetached` returns a promise: resolved on `spawn`, rejected on
  `error`. `install()` awaits it before `quit()`; a rejection becomes
  `UPDATE_INSTALL_FAILED` and the banner offers a retry.
- The install directory is a parameter (`$3` / `INMEMNOTE_INSTALL_DIR`,
  default `/Applications`) so both scripts are unit-tested against temp
  directories with fake `hdiutil`, `open`, `xattr`, `curl`, `uname` and `mv`.

## Why it slipped through

The only test of the shell side checked that `kill -0` appears before `cp -R`
in the script text. No test ran the script, and no test simulated a failed
spawn.

## Incident during the fix

The first red run of the new shell tests executed the *old* helper, which
ignored the sandbox directory and acted on the real `/Applications`: it
deleted the developer machine's `/Applications/Inmemnote.app` and copied the
test fixture there. Note data (`~/Library/Application Support`) was not
touched. The test sandbox now refuses to run any script that mentions
`/Applications` outside comments and the override default, and has its own
test (`src/test/shellSandbox.spec.ts`). Lesson: a red run of a test that
executes a destructive script must not depend on the code under test to
honour the sandbox.

## Residual risk

- The DMG is not checksum-verified before mounting (open item in
  `docs/TZ.md` §4d.3; needs CI to publish a `.sha256`).
- If both the swap and the restore fail, the old bundle stays at
  `.Inmemnote.app.old-<pid>` in `/Applications` (hidden); the helper's
  output goes nowhere (`stdio: 'ignore'`), so this would not be visible.
- A helper that starts and then dies before the swap still leaves the app
  closed without a relaunch.
- The real DMG/`hdiutil` path is not exercised by any automated test.
