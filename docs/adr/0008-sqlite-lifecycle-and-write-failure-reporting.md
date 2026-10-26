# ADR 0008 — Closing the SQLite connection on quit, and reporting write failures

- **Status**: Accepted
- **Date**: 2026-10-26
- **Related**: ADR 0004 (single SQLite connection), ADR 0005 (IPC contracts
  module); bugs #01/#02 (autosave flushed on `beforeunload`), bug #03
  (storage-fallback warning)

## Context

ADR 0004 left two follow-ups:

1. **The shared connection is never closed.** The OS reclaims the handle and
   WAL keeps the file consistent, but the `-wal`/`-shm` side files stay
   behind and the last checkpoint is left to the next launch. Closing must
   not race the renderers: Library and Draft flush their pending autosave
   (`notes:save` / `draft:save`) from `beforeunload` when their window closes
   on quit. Closing before those writes land would lose the last keystrokes.
2. **Only a failed *open* is reported.** Bug #03 added `Container.storage`,
   `storage:status` and the "not saved" banner, but the snapshot was taken
   once at boot. A write that fails later (disk full, DB file deleted) only
   rejects the IPC call; the renderer logs it to its console and the user
   sees nothing. Worse, on POSIX a write to a **deleted or replaced** file
   succeeds — the open handle keeps writing to the unlinked inode — so that
   data is lost with no error at all. (Changing permissions after open does
   not affect the open handle, so it is not a failure mode here.)

## Decision

### Close on `will-quit`

- The lazy shared connection moves out of the composition root into
  `infrastructure/persistence/sqlite/SharedConnection.ts` (`get()`,
  `close()`, `checkFile()`); the container exposes `closeDatabase()`.
- `main/index.ts` calls it from **`will-quit`**. Electron's quit sequence is
  `before-quit` → close every window → `will-quit` → `quit`. Each renderer
  posts its pending autosave from `beforeunload`, before it acknowledges the
  unload, and Chromium delivers a frame's IPC in order, so main dispatches
  the save before the window counts as closed. The save handlers have no
  real async I/O (better-sqlite3 is synchronous; the `await`s resolve as
  microtasks), so the write is done in that same task. By `will-quit`
  every flush has landed.
- `close()` is idempotent, a no-op if the open never happened or failed,
  and checkpoints the WAL (better-sqlite3's `close()` does this).
- A write that still arrives after the close is **not dropped silently**:
  repositories keep the closed handle, the write throws "connection is not
  open", and the write guard (below) logs it in main. We do not reopen the
  file to rescue it — the process is about to exit, and a write that late
  has no window left to show a warning in.

### Report write failures after boot

- `StorageHealthMonitor` (`infrastructure/persistence/`) replaces the
  boot-only array: `degraded` (snapshot), `markDegraded(store, error)` and
  `onChange(listener)`. A store degrades once; the first reason wins.
  **Degradation is sticky for the process lifetime**: a failed write is not
  retried, so a later success would not bring that data back, and a
  "recovered" banner would hide the loss.
- `WriteGuard` + `guard{Draft,Note,Settings}Repository` decorate the SQLite
  repositories in the composition root. Writes (`save`, `delete`) go through
  `WriteGuard.run`, which awaits the write, runs a post-write check, and on
  any failure logs with `console.error`, marks the store degraded and
  rethrows (callers still see the error). Reads pass straight through: they
  lose no data, and a corrupted row is a different problem.
- The post-write check is `SharedConnection.checkFile()`: it compares the
  `dev`/`ino` of the file at the DB path with what was there at open, and
  throws if the file is gone or replaced. One `stat` per autosave is cheap.
- The app does **not** swap a failing store to in-memory. The existing notes
  stay readable from SQLite, and a write may still succeed later; swapping
  would show an empty library and lose more.

### Tell the renderer

- New broadcast `storage:changed` (M→R) in `src/shared/ipc/storage.ts`,
  carrying the full `StorageStatusDTO` snapshot, with
  `window.inmemnote.storage.onChanged`. `registerStorageIpc` subscribes to
  the monitor; `storage:status` now answers the live snapshot.
- Boot-time degradations are not broadcast (no window exists yet); the
  renderer still pulls them at mount.
- The renderer slice **merges** snapshots instead of replacing them: the list
  only grows, so an older `storage:status` reply that arrives after a newer
  push must not hide a failing store.
- Library and Draft subscribe on mount; the banner and the Draft strip are
  unchanged, the wording is now "the database can't be written to" so it fits
  both causes.

## Consequences

- The DB file is closed cleanly on every normal quit, including the
  auto-update relaunch (it goes through `app.quit()`). `app.exit()` or a
  crash still leave the WAL for the next open, as before.
- Every write-time failure is visible: in main's log, and as the persistent
  warning in both windows.
- The ordering argument for `will-quit` rests on Electron/Chromium IPC
  ordering, which unit tests cannot exercise; the fallback (a late write is
  logged, not swallowed) is tested on a real closed connection.
- New code is all in `infrastructure` and `presentation/storage`; domain
  ports and use-cases are unchanged; no new dependency.
