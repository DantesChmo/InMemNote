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

- [ ] Draft — the last keystrokes survive an app quit (incl. the auto-update relaunch) made within 500 ms of typing, and ⌘↵ / Esc / pin still save exactly once (unload flush and no-double-save ✅-unit; the real quit path still needs a manual or e2e check)
       repro: open Draft, type, within 0.5 s press ⌘Q (or install an update), relaunch, open Draft — the text is all there
       added: 2026-10-22 (after bug #02)

## Pin

- [ ] (none yet)

## Library

- [ ] Library — the last keystrokes survive a note switch, a window close and a quit made within 500 ms of typing (switch and unload ✅-unit; the real quit path still needs a manual or e2e check)
       repro: type in note A, within 0.5 s click note B (or ⌘W / ⌘Q), reopen — A has the full text
       added: 2026-10-22 (after bug #01)

## Hotkeys / global shortcuts

- [ ] (none yet)

## Build / packaging / autoupdate

- [ ] (none yet)
