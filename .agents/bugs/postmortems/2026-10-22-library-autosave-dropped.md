# Postmortem — Library drops the last keystrokes (bug #01)

**Date**: 2026-10-22 · **Severity**: major (silent user-data loss) · **Surface**: Library

## What happened

Typing in a Library note and then, within the 500 ms autosave debounce,
selecting another note, closing the window or quitting the app lost the
tail of the edit. The text stayed visible in Redux until the next
`fetchNotes` (triggered by any `notes:changed` broadcast), which then
replaced it with the stale DB copy.

## Root cause

`LibraryEditor` held only a timer id. Its cleanup effect on `selectedId`
change called `clearTimeout`, so the comment's stated goal — "a save for the
previous note doesn't land on the freshly-selected one" — was met by dropping
the save rather than routing it to the right note. Window close and quit don't
unmount React, so no code path ran there at all.

## Fix

- The pending edit is stored as `{ id, content }`, so a flush always targets
  the note that was edited.
- Selection change (and unmount) flushes instead of cancelling.
- A `beforeunload` listener flushes on window close and app quit.
- Deleting a note drops its own pending edit (saving it would only make the
  main-side handler throw).

## Why it slipped through

The existing unit test only covered "debounce fires after 500 ms"; nothing
exercised an interruption of the debounce. E2E never types and switches in
under 500 ms.

## Residual risk

The quit path relies on the async `notes:save` IPC message, posted from
`beforeunload`, being handled before main exits. In practice the message is
queued before the window finishes closing, but it is not verified by an e2e
spec yet. `DraftPanel` has the same quit-time gap and is not covered by this
fix.
