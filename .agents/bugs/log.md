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

### #02 — Draft drops the last <500 ms of typing on quit / update relaunch / window destroy            2026-10-22            severity: major
**Surface**: Draft
**Root cause**: `DraftPanel` wrote edits only from the 500 ms autosave timer, and quitting the app or destroying the Draft window doesn't unmount React, so a pending timer died with the renderer.
**Fix**: The pending edit is kept as `{ id, content }` and flushed on `beforeunload`; ⌘↵, Esc and pin drop it before saving the current content themselves, so nothing is written twice (commit 72b439a).
**Regression test**: `src/presentation/draft/DraftPanel.spec.tsx` ("pending autosave is flushed on unload, never dropped or doubled")
**Postmortem**: `.agents/bugs/postmortems/2026-10-22-draft-autosave-dropped-on-quit.md`
