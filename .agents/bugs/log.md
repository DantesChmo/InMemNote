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

### #03 — SQLite fallback to in-memory is silent; every note is lost on quit            2026-10-22            severity: major
**Surface**: Library, Draft
**Root cause**: `buildDraftRepo` / `buildNoteRepo` / `buildSettingsRepo` in `composition.ts` swallowed the SQLite error into a `console.warn` and nothing else knew the store was in-memory.
**Fix**: The container records each fallback with its reason (`Container.storage`), main answers `storage:status`, Library shows a persistent non-dismissable banner and Draft a one-line strip when drafts or notes are in memory (commit da537e6).
**Regression test**: `src/infrastructure/electron/main/__tests__/composition.spec.ts` ("records each in-memory fallback…"), `src/infrastructure/electron/main/__tests__/ipc/storage.spec.ts`, `src/presentation/storage/StorageBanner.spec.tsx`, `src/presentation/storage/slice.spec.ts`
**Postmortem**: `.agents/bugs/postmortems/2026-10-22-silent-storage-fallback.md`
