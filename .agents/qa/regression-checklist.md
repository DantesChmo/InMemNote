# QA regression checklist

> Owned by the `qa` agent. Read at the start of every session; append a check
> after every bug discovered. Items that earn permanent automation are marked
> ✅-e2e (covered by Playwright) or ✅-unit (covered by Vitest) and removed
> from the manual list when fully replaced by automation.

## Format

```
- [ ] <surface> — <one-sentence behaviour that must still hold>
       repro: <minimal steps>
       added: YYYY-MM-DD (after bug #NN, if applicable)
```

## Draft

- [ ] Draft — the last keystrokes survive an app quit (incl. the auto-update relaunch) made within 500 ms of typing, and ⌘↵ / Esc / pin still save exactly once (unload flush and no-double-save ✅-unit; ⌘Q within 500 ms ✅-e2e `e2e/cross-window/quit-flush.spec.ts`; the auto-update relaunch path still needs a manual check)
       repro: open Draft, type, within 0.5 s press ⌘Q (or install an update), relaunch, open Draft — the text is all there
       added: 2026-10-22 (after bug #02)
- [ ] Draft — with drafts or notes in memory (SQLite failed to open) the overlay shows a one-line "Not saved" strip under the header, in both full and pinned modes; a settings-only fallback shows nothing (✅-unit for the component; real boot with a broken DB in full and pinned modes ✅-e2e `e2e/cross-window/storage-fallback.spec.ts`)
       repro: same broken-DB setup as the Library storage check, press the hotkey, then pin
       added: 2026-10-22 (after bug #03)

## Pin

- [ ] (none yet)

## Library

- [ ] Library — the last keystrokes survive a note switch, a window close and a quit made within 500 ms of typing (switch and unload ✅-unit; switch, window close and quit within 500 ms ✅-e2e `e2e/library/autosave-flush.spec.ts`)
       repro: type in note A, within 0.5 s click note B (or ⌘W / ⌘Q), reopen — A has the full text
       added: 2026-10-22 (after bug #01)
- [ ] Library — if SQLite can't be opened, a non-dismissable banner says notes aren't saved and shows the reason; with a healthy DB no banner shows (container + IPC + banner ✅-unit; real boot against a broken DB, a healthy boot, and the DB deleted at runtime ✅-e2e `e2e/cross-window/storage-fallback.spec.ts`)
       repro: quit the app, `chmod 000 ~/Library/Application\ Support/Inmemnote/inmemnote.db` (or replace it with a directory), launch — banner under the toolbar; restore permissions, relaunch — no banner
       added: 2026-10-22 (after bug #03)
- [ ] Library — a second launch of the app does not start a second process: the running instance brings the Library forward (or reopens it if closed), and the global hotkey keeps working (guard ✅-unit; the real two-process launch still needs a manual check)
       repro: with the app running, close the Library, run `open -n /Applications/Inmemnote.app` — one process in Activity Monitor, the Library is back, ⌘⇧Space still opens Draft
       added: 2026-10-22 (after bug #05)

## Hotkeys / global shortcuts

- [ ] (none yet)

## Build / packaging / autoupdate

- [ ] autoupdate — a failed update never leaves `/Applications` without Inmemnote: a copy or rename failure restores and relaunches the old version, and a helper that fails to start keeps the app open with an error in the banner (✅-unit against a temp dir with fake `hdiutil`; the real DMG swap still needs a manual check on a release)
       repro: install an older release, trigger "Update & restart" → the new version relaunches from `/Applications`, no `.Inmemnote.app.new-*` / `.old-*` left there; repeat with `/Applications/Inmemnote.app` made read-only for the update (e.g. a full disk) → the old version comes back
       added: 2026-10-22 (after bug #04)
