# Postmortem — Draft drops the last keystrokes on quit (bug #02)

**Date**: 2026-10-22 · **Severity**: major (silent user-data loss) · **Surface**: Draft

## What happened

Typing in the Draft panel and then, within the 500 ms autosave debounce,
quitting the app (⌘Q, or the auto-update helper relaunching it) or having
the Draft window destroyed lost the tail of the note. On the next launch
the draft came back without the last keystrokes.

## Root cause

`DraftPanel` held only a timer id, and the only writer of plain typing was
that timer. ⌘↵, Esc and pin each cleared the timer and saved the current
content themselves, so they were safe — but quit and window destroy don't
unmount React and run none of those handlers, so the pending timer simply
died with the renderer. Same shape as bug #01 in `LibraryEditor`, whose
postmortem already flagged `DraftPanel` as having this gap.

## Fix

- The pending edit is stored as `{ id, content }`, so a flush targets the
  draft that was edited even if a hotkey press has opened another one since.
- A `beforeunload` listener flushes it on quit, update relaunch and window
  destroy.
- ⌘↵, Esc and pin drop the pending edit (not just the timer) before saving,
  so a later unload doesn't write the same content a second time.

## Why it slipped through

The unit test only covered "debounce fires after 500 ms"; nothing exercised
the renderer going away mid-debounce. E2E never quits within 500 ms of
typing.

## Residual risk

As with #01, the quit path relies on the async `draft:save` IPC message,
posted from `beforeunload`, being handled before main exits. It is queued
before the window finishes closing, but no e2e spec verifies it yet (E2E
can't run locally at the moment — the native addon doesn't build). The
`setDraft` dispatch after that save resolves may never run; that's harmless
since the renderer is going away anyway.
