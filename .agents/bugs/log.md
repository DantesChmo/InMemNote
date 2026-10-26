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

### #03 — SQLite fallback to in-memory is silent; every note is lost on quit            2026-10-22            severity: major
**Surface**: Library, Draft
**Root cause**: `buildDraftRepo` / `buildNoteRepo` / `buildSettingsRepo` in `composition.ts` swallowed the SQLite error into a `console.warn` and nothing else knew the store was in-memory.
**Fix**: The container records each fallback with its reason (`Container.storage`), main answers `storage:status`, Library shows a persistent non-dismissable banner and Draft a one-line strip when drafts or notes are in memory (commit da537e6).
**Regression test**: `src/infrastructure/electron/main/__tests__/composition.spec.ts` ("records each in-memory fallback…"), `src/infrastructure/electron/main/__tests__/ipc/storage.spec.ts`, `src/presentation/storage/StorageBanner.spec.tsx`, `src/presentation/storage/slice.spec.ts`
**Postmortem**: `.agents/bugs/postmortems/2026-10-22-silent-storage-fallback.md`

### #04 — Self-update can delete the app and quit without relaunching            2026-10-22            severity: major
**Surface**: build
**Root cause**: The update helper (and `scripts/install.sh`) ran `rm -rf` on the installed bundle before `cp -R` of the new one, and `DmgSelfUpdater` quit right after `spawn` without waiting for the helper to start or handling its `error` event.
**Fix**: Copy to a hidden staging path in the install dir, rename old → backup, staged → app, drop the backup; any failure restores the backup and relaunches it. `spawnDetached` resolves on `spawn` / rejects on `error`, and `install()` quits only after it resolves (commit b1f5242).
**Regression test**: `src/infrastructure/update/DmgSelfUpdater.spec.ts` ("does NOT quit if the helper fails to start", "HELPER_SCRIPT (run against a sandbox)"), `scripts/install.spec.ts`
**Postmortem**: `.agents/bugs/postmortems/2026-10-22-updater-unsafe-swap.md`

### #05 — A second launch starts a second process on the same DB and hotkey            2026-10-22            severity: minor
**Surface**: other (main-process lifecycle)
**Root cause**: The main process never called `app.requestSingleInstanceLock()`, so a second launch opened the same `inmemnote.db` and tried to register the same global hotkey.
**Fix**: `claimSingleInstance` takes the lock right after the `userData` override (the lock is per userData directory, so parallel E2E instances are unaffected); a second launch quits before any initialisation and the first instance resurfaces the Library on `second-instance` (commit 26da971).
**Regression test**: `src/infrastructure/electron/main/__tests__/singleInstance.spec.ts`

### #06 — ⌘↵ in the editor inserts a blank line instead of submitting            2026-10-22            severity: minor
**Surface**: Library, Draft
**Root cause**: `CodeMirrorEditor` spread `defaultKeymap` (which binds `Mod-Enter` to `insertBlankLine`) before its own `Mod-Enter`, and CodeMirror stops at the first binding that handles the key — so in Library ⌘↵ never saved (only the 500 ms autosave did), and in Draft a blank line was inserted before DraftPanel's document-level fallback submitted.
**Fix**: `Mod-Enter` / `Escape` are bound before `defaultKeymap`, stop propagation when handled (so DraftPanel's document fallback doesn't submit / close a second time) and fall through to the defaults when no callback is given (commit 7bd5534).
**Regression test**: `src/presentation/draft/editor/CodeMirrorEditor.spec.tsx` ("BUG A: Mod-Enter submits…", "a handled Mod-Enter / Escape does not reach document-level listeners")

### #07 — Editor ⌘↵ / Esc call the first render's onSubmit / onCancel            2026-10-22            severity: minor
**Surface**: Draft, Library
**Root cause**: The keymap is built once at mount and closed over that render's `props`, while both parents rebuild `onSubmit` / `onCancel` on every note change — so Esc in Draft ran the mount-time `onCancel` (draft id still `null` → hide only) on top of the document fallback, and once #06 was fixed Library ⌘↵ would have saved the content captured at mount.
**Fix**: `onSubmit` / `onCancel` are read through refs updated on every render, like `onChange` already was (commit 7bd5534).
**Regression test**: `src/presentation/draft/editor/CodeMirrorEditor.spec.tsx` ("BUG B: …" ×2)

### #08 — External value sync is echoed back through onChange            2026-10-22            severity: minor
**Surface**: Draft, Library
**Root cause**: The `value` → editor sync dispatched an ordinary transaction, so the update listener reported the parent's own value as a user edit — every `setDraft` in DraftPanel became an extra `editContent` plus a redundant debounced save.
**Fix**: The sync transaction carries an `externalSync` annotation that the update listener skips; no parent relied on the echo (commit 7bd5534).
**Regression test**: `src/presentation/draft/editor/CodeMirrorEditor.spec.tsx` ("BUG C: an external value change is not echoed back through onChange")

### #09 — Draft keeps a stale `<html lang>` after a language-only settings change            2026-10-27            severity: minor
**Surface**: Draft
**Root cause**: `app/main.tsx` skipped `applyAppearance` when the broadcast settings compared equal, and the comparison checked theme, hotkey and palette but not `language`, so a window that didn't host the popup never updated `<html lang>` (spellcheck and screen-reader language stayed Russian under English strings).
**Fix**: The comparison moved to `sameAppearance` in `settings/applyTheme.ts` and compares exactly what `applyAppearance` reads: theme, language, palette (commit bbc2ecd).
**Regression test**: `src/presentation/settings/applyTheme.spec.ts` ("a language-only change needs a repaint"), `e2e/settings/language.spec.ts` ("Draft html lang follows a language-only change")

### #10 — Esc doesn't close Settings while the colour input has focus            2026-10-27            severity: minor
**Surface**: other (Settings)
**Root cause**: The popup's window-level Esc handler ignored every `<input>` to spare text fields, but the native colour picker keeps focus after a pick, so Esc neither closed the popup nor rolled back the live preview.
**Fix**: Only text entry (text-like inputs, textarea, contenteditable) keeps Esc; the hotkey-capture trap already stops the event itself (commit c5ca6a6).
**Regression test**: `src/presentation/settings/SettingsPopup.spec.tsx` ("closes the popup from a focused <input type=…>"), `e2e/settings/palette.spec.ts` ("Esc closes the modal while the colour input still has focus")

### #11 — Sidebar counts show the filtered list, not the Library            2026-10-27            severity: minor
**Surface**: Library
**Root cause**: `LibrarySidebar` counted `s.library.notes`, which holds only the current filter or search result, so "All notes" showed 1 of 2 under the Pinned filter and both badges dropped to 0 on a no-match search.
**Fix**: The slice keeps a `catalog` (id + pinned) of every note, fetched unfiltered on mount and on `notes:changed` and patched locally on create, pin and committed delete; a note whose delete can still be undone is left out (commit f9ed943).
**Regression test**: `src/presentation/library/slice.spec.ts` ("catalog (sidebar totals)"), `src/presentation/library/LibrarySidebar.spec.tsx`, `e2e/library/sidebar-counts.spec.ts` ("totals stay put under the Pinned filter and a search")
