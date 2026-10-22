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
- [ ] Library — a second launch of the app does not start a second process: the running instance brings the Library forward (or reopens it if closed), and the global hotkey keeps working (guard ✅-unit; the real two-process launch still needs a manual check)
       repro: with the app running, close the Library, run `open -n /Applications/Inmemnote.app` — one process in Activity Monitor, the Library is back, ⌘⇧Space still opens Draft
       added: 2026-10-22 (after bug #05)

## Hotkeys / global shortcuts

- [ ] (none yet)

## Build / packaging / autoupdate

- [ ] (none yet)
