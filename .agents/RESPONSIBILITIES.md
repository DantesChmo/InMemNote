# Agent responsibilities — distribution map

> This document is the **single source of truth for who owns what** among the
> agents defined in `.claude/agents/`. If an agent's prompt and this table
> disagree, fix one of them — never proceed with the contradiction.

The rule for **where artefacts live**:

- `docs/**` — **human-readable developer documentation**. A new contributor
  should be able to read it cover-to-cover and understand the project.
  Polished, narrative, complete.
- `.agents/**` — **agent operational state**. Working checklists, accumulated
  patterns, regression plans, bug logs. Terse, list-shaped, append-mostly.
  Devs may read it, but it isn't written *for* them.
- `design/**` — visual design assets and mockups.

## Distribution table

| Agent | Model | Owns (writes & keeps current) | Must read before working |
|---|---|---|---|
| `qa` | sonnet | `.agents/qa/regression-checklist.md` | own checklist; `docs/TZ.md`; `design/` |
| `objc-developer` | opus | `native/**` (addon sources); `docs/NATIVE.md` | `docs/NATIVE.md`; `CLAUDE.md §9`; Electron version in `package.json` |
| `react-electron-developer` | sonnet | `src/presentation/**`; `src/infrastructure/electron/**`; co-owns `docs/IPC.md` | `design/`; `docs/IPC.md`; relevant slice + tests |
| `nodejs-backend-developer` | sonnet | `src/application/**`; `src/infrastructure/{persistence,config}/**`; main-side IPC; co-owns `docs/IPC.md` | `docs/HOTKEYS.md`; `docs/IPC.md`; port interfaces in `domain/` |
| `code-reviewer` | opus | `.agents/code-reviewer/patterns.md` | own patterns file; `CLAUDE.md`; full diff under review |
| `test-specialist` | sonnet | `docs/TESTING.md`; all `*.spec.ts(x)` for unit / integration | `docs/TESTING.md`; port interfaces being tested |
| `playwright-specialist` | sonnet | `.agents/playwright/test-plan.md`; all `e2e/**/*.spec.ts` | `.agents/playwright/test-plan.md` (every session); `.agents/qa/regression-checklist.md` |
| `executor` | haiku | — | only the command handed by the caller |
| `validator` | haiku | — | `package.json` scripts |
| `tech-writer` | sonnet | `docs/**` (polishing pass); JSDoc on public surfaces; `README.md` | current diff; existing language of the target doc |
| `architector` | opus | `docs/ARCHITECTURE.md`; `docs/adr/NNNN-*.md` | `docs/ARCHITECTURE.md`; `docs/adr/**`; `CLAUDE.md §1–§4`; code touching the area |
| `ux-designer` | opus | `design/**`; `design/INDEX.md`; co-owns design tokens | `design/INDEX.md`; owning mockup; `CLAUDE.md §7` |
| `bugfix-orchestrator` | opus | `.agents/bugs/log.md`; `.agents/bugs/postmortems/**` | `.agents/bugs/log.md`; `.agents/qa/regression-checklist.md`; `.agents/playwright/test-plan.md` |
| `feature-orchestrator` | opus | `.agents/features/log.md` | `CLAUDE.md §13`; `.agents/RESPONSIBILITIES.md`; `docs/ARCHITECTURE.md`; `docs/TZ.md` |

## Coordination edges (anti-overlap)

- `qa` ↔ `playwright-specialist` — manual regression items graduate from the
  checklist into automated e2e specs. No flow is owned by both.
- `test-specialist` ↔ `playwright-specialist` — anything that doesn't need a
  real Electron window belongs to unit/integration; everything that does
  belongs to e2e.
- `react-electron-developer` ↔ `nodejs-backend-developer` — every IPC channel
  has both a renderer side and a main side; the channel contract in
  `docs/IPC.md` is co-owned and changes require both.
- `architector` ↔ `code-reviewer` — suspected layering violations spotted in
  review are escalated to the architect; the architect either confirms the
  violation (blocker) or updates `docs/ARCHITECTURE.md` to reflect a new,
  approved shape.
- `tech-writer` ↔ everyone — polishing pass on `docs/**` only; never touches
  `.agents/**`, never overrides specialists' first-author content.
- `bugfix-orchestrator` ↔ all developers — orchestrator delegates the fix,
  never edits code directly; updates `.agents/bugs/log.md` at the end.

## Triggers and protocols

Some prompts have a **mandatory protocol** attached. The orchestrator (or
the main session, if no orchestrator is invoked) must execute the protocol
as written, delegating to the agents listed.

### `feature` — feature delivery pipeline

**Trigger**: the first word of the user's prompt is `feature`
(case-insensitive).

**Owner**: `feature-orchestrator` (delegates each step).

**Pipeline** (mandatory, in order, every step acknowledged in writing):

| # | Step | Owning agent | Output |
|---|---|---|---|
| 1 | Architecture impact | `architector` | design note + updates to `docs/ARCHITECTURE.md` / new ADR if needed |
| 2 | UI/UX design (if any UI) | `ux-designer` | mockup + `design/INDEX.md` row |
| 3 | Code plan | relevant developer agent(s) | file-level plan, no code yet |
| 4 | Tests first (red) | `test-specialist` | failing unit/integration specs |
| 5 | Implementation (green) | relevant developer agent(s) | code that turns tests green |
| 6 | E2E | `playwright-specialist` | spec + updated `.agents/playwright/test-plan.md` |
| 7 | Validation | `validator` | tsc + ESLint + Vitest green |
| 8 | Regression | `qa` + `playwright-specialist` | walked checklist + regression suite green |
| 9 | Human documentation | `tech-writer` + first-authors | updated `docs/**` |
| 10 | Constitution updates | orchestrator (sweep) | `CLAUDE.md`, `docs/ARCHITECTURE.md`, this file, `docs/TZ.md` |

A step that genuinely does not apply must be **declared skipped with a
one-line reason**, not silently omitted.

If the first word is **not** `feature`, no protocol fires — act per the
situation.

### `bug` / bug reports

**Owner**: `bugfix-orchestrator`. Pipeline lives in that agent's prompt
(repro → localise → red test → fix → validate → review → log).

## Rules for the agent files themselves

- The canonical agent prompts live in `.claude/agents/*.md`.
- Each agent's "Zone of responsibility" section must match this table. When
  in doubt, this table wins — update the prompt to match, not the other way
  around.
- New agents: add a row here in the same commit that introduces the prompt.
