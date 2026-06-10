# E2E test plan & regression set

> Owned by the `playwright-specialist` agent. Read at the start of **every**
> session before running or writing anything. Append a row after every flake
> fixed or regression pinned.

## Critical flows (must stay green on main)

| # | Flow | Spec file | Notes |
|---|---|---|---|
| 1 | Global hotkey opens Draft panel on top of any app | _(tbd)_ | macOS GlobalShortcut, sensitive to permissions |
| 2 | Type → save persists to SQLite | _(tbd)_ | verify on-disk file |
| 3 | Pin promotes Draft to always-on-top sticky | _(tbd)_ | window lifecycle |
| 4 | Library lists saved notes | _(tbd)_ | ordering, pagination if any |

## Regression set (pinned by past bugs)

| # | Bug ref | Behaviour pinned | Spec file | Added |
|---|---|---|---|---|
| _(none yet)_ | | | | |

## Known flakes / quarantine

| Spec | Symptom | Suspected cause | Status |
|---|---|---|---|
| _(none yet)_ | | | |

## Conventions

- One `userData` dir per test (temp), torn down after.
- No `page.waitForTimeout`. Wait on state via `expect(locator).toBeVisible()`.
- A flake is "fixed" only after ≥10 green runs in isolation.
- Promote items from `.agents/qa/regression-checklist.md` when they're stable
  enough to automate.
