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
**Fix**: The pending edit is kept as `{ id, content }` and flushed on selection change and on `beforeunload`; deleting a note drops its pending edit (commit pending).
**Regression test**: `src/presentation/library/LibraryEditor.spec.tsx` ("pending autosave is flushed, never dropped")
**Postmortem**: `.agents/bugs/postmortems/2026-10-22-library-autosave-dropped.md`
