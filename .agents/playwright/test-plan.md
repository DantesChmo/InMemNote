# E2E test plan & regression set

> Owned by the `playwright-specialist` agent. Read at the start of **every**
> session before running or writing anything. Append a row after every flake
> fixed or regression pinned.
>
> Per-scenario detail (preconditions / steps / expected, priority, type) is
> **not** duplicated here: it lives in the JSDoc on each `test(...)` and is
> compiled into [`e2e/TEST-PLAN.md`](../../e2e/TEST-PLAN.md) by
> `npm run gen:test-plan`. CI runs `npm run check:test-plan` and fails when
> the generated file is stale. This file is the map: flow → spec.

## Critical flows (must stay green on main)

| # | Flow | Spec file(s) | Notes |
|---|---|---|---|
| 1 | Global hotkey opens Draft panel on top of any app | `e2e/draft/lifecycle.spec.ts` — "summon shows the overlay…", "rapid toggle does not multiply Draft windows…", "toggle while hidden re-shows the same window…", "summon centers the overlay on the work-area…" | The real OS shortcut is **not** fired: under `INMEMNOTE_E2E=1` the `globalShortcut` is disabled and `DraftPage.summon` (`e2e/helpers/draft.ts`) calls `globalThis.__inmemnoteTest.showDraft()` in the main process (registered by `main/e2e.ts`), which runs the same `DraftWindowController.toggle()` the hotkey does. Registration + precedence are unit-tested in `src/infrastructure/electron/main/__tests__/hotkey.spec.ts`. |
| 2 | Type → save persists to SQLite | `e2e/draft/lifecycle.spec.ts` — "typing triggers an autosave…", "the scratch buffer survives a full app restart…", "summon → type → hide → restart…", "CJK + emoji content round-trips…"; `e2e/library/crud.spec.ts` — "persists notes across app restarts…", "multi-KB content saves and reloads…" | Persistence is verified by relaunching against the same tmp `userData`, not by reading the DB file directly. |
| 3 | Pin promotes Draft to always-on-top sticky | `e2e/draft/lifecycle.spec.ts` — "pin keeps the overlay always-on-top…", "Esc on a PINNED overlay is a no-op…", "pin toggle is reversible…"; `e2e/draft/pin-resize.spec.ts`; `e2e/draft/pin-drag.spec.ts`; `e2e/draft/pin-resize-manual.spec.ts`; `e2e/draft/content-protection.spec.ts` | Window geometry 560 ↔ 320, `alwaysOnTop`, corner anchor, drag-to-corner, manual resize clamps, content protection across pin cycles. |
| 4 | Library lists saved notes | `e2e/library/crud.spec.ts`; `e2e/library/pin.spec.ts` — "pinned notes rise to the top…", "multiple pinned notes preserve their relative order…" | Ordering contract: pinned first, then `updatedAt` DESC. No pagination exists. |
| 5 | Draft `⌘↵` promotes into Library | `e2e/cross-window/draft-promote.spec.ts` (all 10); `e2e/draft/lifecycle.spec.ts` — "empty draft promote (⌘↵) does not create a note…" | Empty / whitespace-only drafts create nothing; `notes:changed` refreshes an open Library. |
| 6 | Library search and filters | `e2e/library/search-filter.spec.ts` | `⌘F`, live search + highlight, `Esc` reset, Pinned filter, case / Unicode / body match. |
| 7 | Renderer boots with design tokens | `e2e/visual-smoke.spec.ts` | Tokens resolve, Tailwind utilities ship, React mounted. |
| 8 | Renderer CSP enforced in both windows, editor works under it | `e2e/cross-window/csp.spec.ts` | Prod policy only (E2E runs the built renderer); the dev policy is relaxed for Vite HMR. |
| 9 | Library soft delete + undo toast | `e2e/library/undo-delete.spec.ts` | Undo button / ⌘Z (not inside the editor), expiry commits, second delete commits the first, graceful quit commits, SIGKILL keeps the note, hover pause. |
| 10 | No keystroke lost on switch / close / quit within 500 ms | `e2e/library/autosave-flush.spec.ts`, `e2e/cross-window/quit-flush.spec.ts` | Bugs #01 / #02 on the real quit path. ⌘↵ flush is proven with a frozen `page.clock`, so autosave can't be the writer. |
| 11 | Storage fallback is never silent | `e2e/cross-window/storage-fallback.spec.ts` | `inmemnote.db` pre-seeded as a directory (chmod 000 still opens as root on CI); the DB file deleted at runtime raises the banner via `storage:changed`. |
| 12 | Settings: theme, palette, hotkey, language persist and reach Draft | `e2e/settings/*.spec.ts` | Live preview + Esc / Cancel rollback; restart persistence; `settings:changed` into an open Draft. Labels match ru and en (the language spec flips the UI mid-test). |

## Spec inventory

123 scenarios in 24 files (matches the summary in `e2e/TEST-PLAN.md`).

| Spec file | Scenarios | Covers |
|---|---|---|
| `e2e/draft/lifecycle.spec.ts` | 16 | summon / hide / blur, autosave + restart rehydration, pin vs. blur and Esc, toggle races, positioning, empty promote, oversize / CJK / mid-document edits |
| `e2e/draft/markdown-render.spec.ts` | 3 | heading + inline styling, h3 scale, `#Foo` is not a heading |
| `e2e/draft/list-quote-render.spec.ts` | 3 | bullet widgets, `*` bullets, quote accent stripe, `-x` is not a bullet |
| `e2e/draft/pin-resize.spec.ts` | 3 | 560 ↔ 320 width, `alwaysOnTop` flip, no drift over many toggles |
| `e2e/draft/pin-drag.spec.ts` | 2 | drop on a quadrant snaps to that corner (one test body, looped over corners), first pin lands top-right |
| `e2e/draft/pin-resize-manual.spec.ts` | 6 | `setPinSize` grow + 45 % clamp, reset, `getCorner`, no-op while unpinned, min clamp, anchor stability |
| `e2e/draft/content-protection.spec.ts` | 1 | content protection survives pin / unpin cycles |
| `e2e/library/crud.spec.ts` | 12 | create / edit / delete, switching, restart persistence, untitled, title derivation, `⌘N` races, large content, injection-shaped payload, debounce, empty state |
| `e2e/library/pin.spec.ts` | 6 | pin marker, ordering, restart persistence, Pinned filter, pin spam |
| `e2e/library/search-filter.spec.ts` | 12 | see flow 6 |
| `e2e/cross-window/draft-promote.spec.ts` | 10 | see flow 5, plus promote under filter / search, selection stability, title derivation |
| `e2e/cross-window/csp.spec.ts` | 1 | see flow 8 |
| `e2e/visual-smoke.spec.ts` | 1 | see flow 7 |
| `e2e/library/undo-delete.spec.ts` | 11 | see flow 9 |
| `e2e/library/autosave-flush.spec.ts` | 4 | see flow 10, plus Library close → Dock `activate` reopens it |
| `e2e/library/sidebar-counts.spec.ts` | 3 | counts follow create / pin / delete / undo and restart; totals under filter / search (bug #11) |
| `e2e/cross-window/quit-flush.spec.ts` | 1 | see flow 10 (Draft) |
| `e2e/cross-window/storage-fallback.spec.ts` | 5 | see flow 11 |
| `e2e/settings/popup.spec.ts` | 4 | open via gear, Esc / dim / close / Cancel |
| `e2e/settings/theme.spec.ts` | 3 | live preview + rollback, restart, broadcast to Draft |
| `e2e/settings/palette.spec.ts` | 5 | live preview + rollback, restart + Draft, per-token reset, Esc in colour input (bug #10) |
| `e2e/settings/hotkey.spec.ts` | 4 | capture persists, modifier-only ignored, cancel, invalid accelerator rejected by main |
| `e2e/settings/language.spec.ts` | 5 | en switch + `<html lang>` + restart, Draft pick-up, system → ru, cancel, Draft `<html lang>` (bug #09) |
| `e2e/settings/update-banner.spec.ts` | 2 | fake `update:available` broadcast → banner, Later, re-surface with newer version |

Helpers: `e2e/helpers/app.ts` (launch with tmp `userData` + `INMEMNOTE_E2E=1`),
`e2e/helpers/draft.ts` (`DraftPage`), `e2e/helpers/library.ts` (`LibraryPage`,
`restartApp`, `crashAndRestartApp`, `storedNotes()` over `notes:list` for
`expect.poll` persistence waits), `e2e/helpers/settings.ts` (`SettingsPopup`,
token / theme / language readers, `broadcastUpdateAvailable`).

A known, unfixed bug is pinned by a scenario that asserts the correct
behaviour and is marked fixme. Write it as
`test.fixme(true, '<reason>')` inside the body, never as a top-level
`test.fixme(...)`: `gen-test-plan.mjs` only matches `test(`. Drop the line
when the bug is fixed.

## Not covered by e2e (by design or not yet)

| Surface | Status | Where it is covered instead |
|---|---|---|
| Auto-update install, download progress / failure banner states | deliberately excluded — it quits and swaps the running app; auto-check and the real gateway are disabled under `INMEMNOTE_E2E=1` (`docs/TZ.md` §4d). Only the banner's appearance / dismiss is e2e. | `src/presentation/update/*.spec.ts(x)`, `src/application/update/`, `src/infrastructure/update/` (incl. `DmgSelfUpdater.wiring.spec.ts` over a local HTTP server) |
| Real global shortcut (OS hotkey) | disabled under E2E | `src/infrastructure/electron/main/__tests__/hotkey.spec.ts` |
| Second app launch (single instance, bug #05) | needs two processes on one userData; not automated | `src/infrastructure/electron/main/__tests__/singleInstance.spec.ts` |
| Hotkey capture rejection message | unreachable from the keyboard (`mapKey` only emits allow-listed tokens); rejection is e2e-tested at the IPC boundary instead | `src/presentation/settings/HotkeyInput.spec.tsx` |

## Regression set (pinned by past bugs)

| # | Bug ref | Behaviour pinned | Spec file | Added |
|---|---|---|---|---|
| 1 | `.agents/bugs/log.md` #01 | A pending Library edit (< 500 ms old) is flushed, never dropped, on note switch, window close and quit | `e2e/library/autosave-flush.spec.ts` (+ unit `LibraryEditor.spec.tsx`) | 2026-10-27 |
| 2 | `.agents/bugs/log.md` #02 | A pending Draft edit (< 500 ms old) survives a quit | `e2e/cross-window/quit-flush.spec.ts` (+ unit `DraftPanel.spec.tsx`) | 2026-10-27 |
| 3 | `.agents/bugs/log.md` #03, ADR 0008 | A DB that can't be opened or is deleted at runtime shows the Library banner and the Draft strip; a healthy DB shows neither | `e2e/cross-window/storage-fallback.spec.ts` | 2026-10-27 |
| 4 | `.agents/bugs/log.md` #09 | A language-only save updates Draft's `<html lang>` | `e2e/settings/language.spec.ts` | 2026-10-27 |
| 5 | `.agents/bugs/log.md` #10 | Esc closes Settings while the colour input has focus | `e2e/settings/palette.spec.ts` | 2026-10-27 |
| 6 | `.agents/bugs/log.md` #11 | Sidebar counts stay Library totals under a filter or search | `e2e/library/sidebar-counts.spec.ts` | 2026-10-27 |

## Known flakes / quarantine

| Spec | Symptom | Suspected cause | Status |
|---|---|---|---|
| `e2e/library/undo-delete.spec.ts` — "hovering the toast keeps it past 6 s…" | Toast gone at 6.5 s (7/10 in one batch while other agents ran Electron; 0/16 alone afterwards) | Another process took OS focus and Chromium dropped `:hover` | Mitigated 2026-10-27: the spec re-asserts hover every 100 ms during the hold, 10/10 green since. Re-run alone first if it fails under load. |

## Conventions

- The full suite runs only in CI. Locally, run single spec files, and only
  when the developer agrees: every launch steals OS focus from their work.
- One `userData` dir per test (temp), torn down after.
- No `page.waitForTimeout`. Wait on state via `expect(locator).toBeVisible()`.
- A flake is "fixed" only after ≥10 green runs in isolation.
- Every `test(...)` carries the JSDoc block that `scripts/gen-test-plan.mjs`
  compiles; regenerate `e2e/TEST-PLAN.md` in the same change as the spec.
- `workers: 1` locally and per CI shard (`playwright.config.ts`); CI
  parallelism comes from `--shard` across runner jobs.
- Promote items from `.agents/qa/regression-checklist.md` when they're stable
  enough to automate.
