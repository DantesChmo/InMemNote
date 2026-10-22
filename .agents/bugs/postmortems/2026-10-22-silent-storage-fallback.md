# Postmortem — silent fallback to in-memory storage (bug #03)

**Date**: 2026-10-22 · **Severity**: major (silent user-data loss) · **Surface**: Library, Draft

## What happened

When SQLite could not be opened at boot (native `better-sqlite3` binding
failing to load after an Electron/ABI mismatch, an unwritable or corrupt
`userData/inmemnote.db`, a locked file), each repository in the composition
root fell back to its in-memory twin. The app looked and behaved normally:
notes could be created, edited, pinned and searched. On quit all of it
vanished. The only trace was a `console.warn` in the main-process log, which
an end user never sees.

## Root cause

`buildDraftRepo` / `buildNoteRepo` / `buildSettingsRepo` in
`src/infrastructure/electron/main/composition.ts` caught the constructor
error and returned the in-memory repository. The fallback itself was a
deliberate design choice (the app still boots, one broken store doesn't
take the others down), but the "surface a clear warning" half of that
design was never implemented: the container had no way to say that it had
degraded, so neither main nor the renderer could tell the user.

## Fix

- `buildContainer` passes a collector into each `build*Repo`; a fallback
  pushes `{ store, reason }` into it. The result is exposed as
  `Container.storage.degraded` (empty = everything is on disk).
- New pull-only IPC channel `storage:status` (`registerStorageIpc`) returns
  a copy of that list as `StorageStatusDTO`. No broadcast: the container is
  built once, so the answer never changes during the process lifetime.
- Preload exposes `window.inmemnote.storage.status()`; a `storage` slice
  mirrors it, fetched on mount by both windows.
- `StorageBanner` (Library, under the toolbar, above `UpdateBanner`): a
  persistent strip with no dismiss button. Text depends on what is at risk —
  notes/drafts ("Notes aren't being saved… lost when you quit") vs.
  settings only ("Settings aren't being saved…"), plus the error reason.
- `StorageBanner variant="compact"` in Draft: a 28 px one-line strip under
  the header, in both full and pinned modes, shown only when drafts or notes
  are in memory (⌘↵ promotes into notes). A settings-only fallback does not
  endanger the typed text, so Draft stays clean in that case.

### Why Draft shows a warning too

Draft is the hotkey-only entry point: Library opens at launch but the user
can close it and keep capturing through the global hotkey for days. Draft
writes to the same `drafts` store and promotes into `notes`, so it is
exactly where the data is being lost. The strip is kept to one line and
appears only when the draft text is actually at risk, which is the
smallest footprint that still guarantees the user sees the warning where
they type.

## Why it slipped through

The existing composition test only asserted the *type* of the fallback
repository ("falls back to in-memory"), i.e. it locked in the silent
behaviour. Nothing in the spec (`docs/TZ.md` §2.5 "Falls back to an
in-memory repository if SQLite init fails") required the user to be told.

## Residual risk

- The banner covers failures at *open* time only. A SQLite error on a later
  write (disk full, file deleted under us) still surfaces as a per-call
  rejected IPC promise, not as a persistent banner.
- Nothing is verified end-to-end: the native addon does not build on the
  current dev machine, so the app was not launched against a broken DB.
  A manual check is listed in `.agents/qa/regression-checklist.md`.
