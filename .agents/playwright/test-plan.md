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

## Spec inventory

76 scenarios in 13 files (matches the summary in `e2e/TEST-PLAN.md`).

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

Helpers: `e2e/helpers/app.ts` (launch with tmp `userData` + `INMEMNOTE_E2E=1`),
`e2e/helpers/draft.ts` (`DraftPage`), `e2e/helpers/library.ts`.

## Not covered by e2e (by design or not yet)

| Surface | Status | Where it is covered instead |
|---|---|---|
| Settings popup (theme, palette, hotkey capture, language) | no spec yet | component + slice tests in `src/presentation/settings/`; use-cases in `src/application/settings/` |
| i18n (locale switch, `<html lang>`) | no spec yet | `src/presentation/i18n/useTranslation.spec.tsx` |
| Auto-update install | deliberately excluded — it quits and swaps the running app; auto-check and the real gateway are disabled under `INMEMNOTE_E2E=1` (`docs/TZ.md` §4d) | `src/presentation/update/*.spec.ts(x)`, `src/application/update/`, `src/infrastructure/update/` |
| Library autosave flush on note switch / close / quit (bug #01) | no e2e yet | `src/presentation/library/LibraryEditor.spec.tsx` |

## Regression set (pinned by past bugs)

| # | Bug ref | Behaviour pinned | Spec file | Added |
|---|---|---|---|---|
| 1 | `.agents/bugs/log.md` #01 | A pending Library edit (< 500 ms old) is flushed, never dropped, on note switch, window close and quit | unit only: `src/presentation/library/LibraryEditor.spec.tsx` — no e2e spec yet (candidate) | 2026-10-22 |

## Known flakes / quarantine

| Spec | Symptom | Suspected cause | Status |
|---|---|---|---|
| _(none yet)_ | | | |

## Conventions

- One `userData` dir per test (temp), torn down after.
- No `page.waitForTimeout`. Wait on state via `expect(locator).toBeVisible()`.
- A flake is "fixed" only after ≥10 green runs in isolation.
- Every `test(...)` carries the JSDoc block that `scripts/gen-test-plan.mjs`
  compiles; regenerate `e2e/TEST-PLAN.md` in the same change as the spec.
- `workers: 1` locally and per CI shard (`playwright.config.ts`); CI
  parallelism comes from `--shard` across runner jobs.
- Promote items from `.agents/qa/regression-checklist.md` when they're stable
  enough to automate.
