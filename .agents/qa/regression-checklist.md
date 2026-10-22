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

- [ ] (none yet)

## Pin

- [ ] (none yet)

## Library

- [ ] Library — the last keystrokes survive a note switch, a window close and a quit made within 500 ms of typing (switch and unload ✅-unit; the real quit path still needs a manual or e2e check)
       repro: type in note A, within 0.5 s click note B (or ⌘W / ⌘Q), reopen — A has the full text
       added: 2026-10-22 (after bug #01)

## Hotkeys / global shortcuts

- [ ] (none yet)

## Build / packaging / autoupdate

- [ ] autoupdate — a failed update never leaves `/Applications` without Inmemnote: a copy or rename failure restores and relaunches the old version, and a helper that fails to start keeps the app open with an error in the banner (✅-unit against a temp dir with fake `hdiutil`; the real DMG swap still needs a manual check on a release)
       repro: install an older release, trigger "Update & restart" → the new version relaunches from `/Applications`, no `.Inmemnote.app.new-*` / `.old-*` left there; repeat with `/Applications/Inmemnote.app` made read-only for the update (e.g. a full disk) → the old version comes back
       added: 2026-10-22 (after bug #04)
