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

- [ ] Draft — with drafts or notes in memory (SQLite failed to open) the overlay shows a one-line "Not saved" strip under the header, in both full and pinned modes; a settings-only fallback shows nothing (✅-unit for the component; real boot needs a manual check)
       repro: same broken-DB setup as the Library storage check, press the hotkey, then pin
       added: 2026-10-22 (after bug #03)

## Pin

- [ ] (none yet)

## Library

- [ ] Library — the last keystrokes survive a note switch, a window close and a quit made within 500 ms of typing (switch and unload ✅-unit; the real quit path still needs a manual or e2e check)
       repro: type in note A, within 0.5 s click note B (or ⌘W / ⌘Q), reopen — A has the full text
       added: 2026-10-22 (after bug #01)
- [ ] Library — if SQLite can't be opened, a non-dismissable banner says notes aren't saved and shows the reason; with a healthy DB no banner shows (container + IPC + banner ✅-unit; the real boot against a broken DB still needs a manual check)
       repro: quit the app, `chmod 000 ~/Library/Application\ Support/Inmemnote/inmemnote.db` (or replace it with a directory), launch — banner under the toolbar; restore permissions, relaunch — no banner
       added: 2026-10-22 (after bug #03)

## Hotkeys / global shortcuts

- [ ] (none yet)

## Build / packaging / autoupdate

- [ ] (none yet)
