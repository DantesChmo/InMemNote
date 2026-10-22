# Bug log

> Owned by the `bugfix-orchestrator` agent. One row per fixed bug. Read at
> the start of every session — a new report matching an old row is a
> regression of a previous fix and is triaged differently.

## Format

```
### #NN — <one-line title>            YYYY-MM-DD            severity: blocker | major | minor | cosmetic
**Surface**: Draft | Pin | Library | hotkey | build | native | other
**Root cause**: <one sentence>
**Fix**: <one sentence> (commit <sha>)
**Regression test**: <path/to/spec.ts>
**Postmortem**: `.agents/bugs/postmortems/YYYY-MM-DD-<slug>.md` (if severity ≥ major)
```

## Entries

### #01 — Library drops the last <500 ms of typing on note switch / close / quit            2026-10-22            severity: major
**Surface**: Library
**Root cause**: `LibraryEditor` cancelled the pending autosave debounce on selection change instead of flushing it, and had no hook for window close or app quit at all.
**Fix**: The pending edit is kept as `{ id, content }` and flushed on selection change and on `beforeunload`; deleting a note drops its pending edit (commit 2ffe4d2).
**Regression test**: `src/presentation/library/LibraryEditor.spec.tsx` ("pending autosave is flushed, never dropped")
**Postmortem**: `.agents/bugs/postmortems/2026-10-22-library-autosave-dropped.md`

### #05 — A second launch starts a second process on the same DB and hotkey            2026-10-22            severity: minor
**Surface**: other (main-process lifecycle)
**Root cause**: The main process never called `app.requestSingleInstanceLock()`, so a second launch opened the same `inmemnote.db` and tried to register the same global hotkey.
**Fix**: `claimSingleInstance` takes the lock right after the `userData` override (the lock is per userData directory, so parallel E2E instances are unaffected); a second launch quits before any initialisation and the first instance resurfaces the Library on `second-instance` (commit 26da971).
**Regression test**: `src/infrastructure/electron/main/__tests__/singleInstance.spec.ts`
