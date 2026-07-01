# Inmemnote — project constitution

> This document is the **source of truth** for both the agent and humans
> working in this repository.
> A discrepancy between code and `CLAUDE.md` is a reason to stop and discuss
> it, not to silently retrofit the document to whatever the code already does.

---

## 1. What this is

**Inmemnote** is a desktop quick-notes app for macOS in the spirit of
Spotlight. The main flow: the user presses a global hotkey → a "Draft" panel
appears on top of any application → they type a note in Markdown →
close / save / pin.

No cloud. No backend. Everything is stored locally.

### Surfaces (V1 → onward)
- **Draft** — quick-capture overlay (V1, current iteration).
- **Pin** — a compact "sticky" that lives on top of every window.
- **Library** — a browser for all notes.

### What this project does NOT have and will NOT have
- HTTP server / API / backend-driven sync.
- Accounts, auth, telemetry.

---

## 2. Stack

| Layer              | Tech                                                  |
|--------------------|-------------------------------------------------------|
| Language           | TypeScript (strict)                                   |
| Runtime            | Electron + Node.js                                    |
| Bundler            | Electron Forge with the Vite template                 |
| UI                 | React 18                                              |
| Styling            | Tailwind CSS (+ CSS custom properties)                |
| State              | Redux Toolkit                                         |
| Markdown editor    | CodeMirror 6                                          |
| Cold storage       | SQLite (`better-sqlite3`)                             |
| Config validation  | Zod                                                   |
| Unit / component   | Vitest + React Testing Library                        |
| E2E                | Playwright (Electron driver)                          |
| Linter             | ESLint (typescript-eslint, react-hooks)               |
| Formatter          | Prettier                                              |
| Pre-commit         | husky + lint-staged                                   |
| Auto-update        | In-house signing-free updater over the GitHub Releases feed |

Any deviation from the stack is approved explicitly and then reflected in
this section.

> **Auto-update note.** The stack originally named `update-electron-app`, but
> it was never wired in: Squirrel.Mac (its engine) requires a valid Apple
> Developer ID signature, which this app deliberately lacks (it ships
> ad-hoc-signed and installs via `curl` to dodge Gatekeeper's quarantine).
> V2.3 instead ships an in-house updater that reads the same GitHub Releases
> feed and applies updates by reproducing `scripts/install.sh` from a
> detached helper. The `update-electron-app` package is now dead and slated
> for removal. Details: `docs/TZ.md` §4d.

---

## 3. Architecture — DDD by layers

```
src/
├── domain/            # pure TS. No imports from react/electron/sqlite.
│   ├── draft/
│   │   ├── DraftNote.ts          # Entity
│   │   ├── NoteContent.ts        # Value Object
│   │   ├── DraftId.ts            # Value Object (branded string)
│   │   ├── DraftRepository.ts    # interface
│   │   └── events.ts             # domain events
│   └── shared/                   # shared types, Result/Either, errors
│
├── application/       # use-cases. Depends on domain, ignorant of frameworks.
│   └── draft/
│       ├── OpenDraftUseCase.ts
│       ├── SaveDraftUseCase.ts
│       ├── TogglePinUseCase.ts
│       └── CloseDraftUseCase.ts
│
├── infrastructure/    # port implementations: SQLite, Electron adapters, IPC.
│   ├── persistence/sqlite/
│   ├── electron/
│   │   ├── main/                 # main-process entry point
│   │   ├── preload/              # contextBridge
│   │   └── hotkey/               # GlobalShortcut wrapper
│   └── config/                   # loaders for hotkeys.yaml + user override
│
├── presentation/      # React + Redux.
│   ├── draft/
│   │   ├── DraftPanel.tsx
│   │   ├── DraftHeader.tsx
│   │   ├── DraftFooter.tsx
│   │   ├── editor/CodeMirrorEditor.tsx
│   │   └── slice.ts              # Redux Toolkit slice
│   ├── theme/
│   └── app/                      # React app root
│
└── shared/            # truly cross-cutting utilities (logger, assert)
```

**Dependency rule** (loosening it = a review-blocking bug):
`presentation → application → domain`
`infrastructure → application/domain (port implementations only)`
`domain` depends on nothing. Ever.

---

## 4. Principles

### SOLID
- **S** — each use-case = one scenario.
- **O** — we extend via new interface implementations rather than editing
  existing ones.
- **L** — repository implementations are interchangeable (in-memory for
  tests, SQLite in production).
- **I** — narrow port interfaces (`DraftRepository` ≠ "GodRepository").
- **D** — application/presentation depend on interfaces declared in `domain`.

### DRY — but not fanatical
Three similar lines beat a premature abstraction. We extract duplication
only when it would pinch us during a change.

### DDD
- The domain vocabulary in code matches the mockups and the brief
  (`Draft`, `Pin`, `Library`, `NoteContent`).
- Domain has no knowledge of SQLite, React, or IPC.
- Use-cases return `Result<T, DomainError>` — no `throw` across layers.

### TDD (workflow)
Every feature ships through this pipeline:

1. **Interfaces and signatures** — types, abstract classes, JSDoc. No
   bodies yet.
2. **Tests** — red, describing the desired behavior.
3. **Implementation** — until the tests turn green.
4. **Refactor** while the tests stay green.

Commit in small steps: "interfaces", "red tests", "green", "refactor".

---

## 5. Code is written by a Senior, read by a Junior

### What we comment
- The **why**, not the what — names already cover "what".
- Non-obvious invariants ("content over 1 MB is stored separately, because…").
- Workarounds with their reason ("Electron 28 drops the shortcut while
  fullscreen — we work around it like this…").
- Domain rules that aren't expressible in the type system.

### What we do NOT comment
- "Here we create a reducer" above `createSlice` — that's obvious.
- "Used by LibraryScreen" — rots instantly.
- TODOs without a date and an author.

### Comment style
- **All comments in source files are written in English** (`//`, `/* */`,
  JSDoc). Markdown documentation (including this file) is written in
  whatever language the user/team requested for the doc.
- JSDoc on public domain/application interfaces (it shows up in IDE
  tooltips).
- Multi-line block at the top of an aggregate file explains the **role
  that file plays in the system**.

---

## 6. Hotkeys

- Source-of-truth file: `config/hotkeys.yaml` (defaults that ship with the app).
- User override: `~/Library/Application Support/Inmemnote/hotkeys.yaml`.
- The schema is Zod-validated at startup; an invalid user file → fall back
  to defaults + log.
- Default `openDraft` = `CommandOrControl+Shift+Space`.

Details in `docs/HOTKEYS.md`.

---

## 7. Design

- Source of truth: the `design/` folder (HTML mockups + screenshots from
  the customer).
- Palette, typography, and sizing are lifted from
  `design/Inmemnote - Draft (hi-fi).html`.
- **Accent color: `#3f7d6b` (green).** The other accent colors offered in
  the mock are ignored.
- 4 px grid. Every padding/size is an integer multiple of 4.
- Themes: dark (primary) + light.

---

## 8. Testing

- **Unit (Vitest)** — domain (100% coverage is desirable), application
  (use-cases) — mandatory.
- **Component (Vitest + RTL)** — presentational components with state
  logic.
- **E2E (Playwright)** — critical flows: opening Draft via the hotkey,
  saving, pinning.
- Every test lives next to the code it covers: `Foo.ts` ↔ `Foo.spec.ts`.

---

## 9. Code quality

- `tsc --noEmit` clean on pre-commit.
- ESLint with no `warn`s in the diff.
- Prettier is the only formatter.
- Any function with cyclomatic complexity > 10 is a candidate for
  decomposition.
- **Dependency installs go through `npm ci`, never `npm install`.**
  `npm ci` rebuilds `node_modules` strictly from the lockfile and is the
  only mode that guarantees reproducibility — critical here because we
  have a native addon (`@inmemnote/window-events`) whose ABI must match
  the installed Electron exactly. `npm install` is reserved for the
  single case of adding or removing a dependency; the resulting
  lockfile change is committed in the same step.

---

## 10. Workflow

1. Pick a task from `docs/TZ.md` (mark it `[~]` — in progress).
2. Run it through the TDD pipeline (section 4).
3. On completion — `[x]` in `docs/TZ.md`, with a short note about the
   decisions made.
4. Open questions discovered along the way go into the "Open questions"
   block of `docs/TZ.md`.

---

## 11. Context and memory

`docs/TZ.md` is **state**. If context limits run out, a new session must be
able to continue by reading:
1. `CLAUDE.md` (this file — what & how).
2. `docs/TZ.md` (where we currently are).
3. `design/` (what it should look like).
4. `.agents/RESPONSIBILITIES.md` (who — which agent — owns what).

---

## 12. Agents and where their state lives

The project ships with a fleet of specialist agents (QA, architector, code
reviewer, developer agents per stack layer, etc.). They are an integral
part of how work gets done here, not an optional add-on.

### Repo layout

| Path | Purpose | Edited by |
|---|---|---|
| `.claude/agents/*.md` | Agent prompts (system instructions per agent). | Humans — these are configuration. |
| `.agents/` | **Agent operational state** — checklists, accumulated patterns, regression plans, bug log, postmortems. Read by agents at the start of every session and appended to during work. | The owning agent (see below). |
| `.agents/RESPONSIBILITIES.md` | **Master distribution map**: which agent owns which files, which docs they must read first, and how they coordinate with each other. | Maintained alongside the agent prompts. |
| `docs/` | **Human-readable developer documentation**. Polished, narrative. | Specialist agents first-author their section; `tech-writer` polishes. |
| `design/` | Visual design assets and mockups. | `ux-designer`. |

### Rules

- `docs/**` and `.agents/**` are **different in kind**. Anything that a
  new contributor should read to understand the project belongs in
  `docs/`. Anything that is the working memory of an agent (lists,
  patterns, plans) belongs in `.agents/`.
- The agent prompts in `.claude/agents/*.md` and the table in
  `.agents/RESPONSIBILITIES.md` must agree. If they disagree, that's a
  bug — fix one of them, don't proceed with the contradiction.
- When adding a new agent: drop a prompt into `.claude/agents/`, add a
  row to `.agents/RESPONSIBILITIES.md` in the same change.

---

## 13. Feature trigger — the `feature` keyword

If the **first word** of the user's prompt is `feature` (case-insensitive),
the work is a *feature delivery*, not an ad-hoc task. The full pipeline
below is **mandatory and non-negotiable**, executed by delegating to the
appropriate specialist agents — typically via `feature-orchestrator`.

If the first word is anything else, act per the situation; no pipeline is
forced.

### The pipeline (in order)

1. **Architecture** — `architector` designs the change (or explicitly
   states "no architectural change required" with reasoning). Updates
   `docs/ARCHITECTURE.md` if shape changes. New ADR if a non-trivial
   decision was made.
2. **Design** — `ux-designer` if any UI surface is involved. Mockup or
   updated entry in `design/INDEX.md`. Skipped only for purely non-UI
   features, with an explicit note.
3. **Code plan** — the relevant developer agent(s) draft a file-level
   plan (which files, which interfaces, sequencing). No production code
   yet.
4. **Tests first** — `test-specialist` writes failing unit / integration
   tests against the planned interfaces (TDD red — CLAUDE.md §4).
5. **Implementation** — the developer agent(s) turn the red tests green.
   No scope creep beyond the plan.
6. **E2E** — `playwright-specialist` adds an e2e spec covering the
   feature's primary user flow and updates
   `.agents/playwright/test-plan.md`.
7. **Validation** — `validator` runs type-check + ESLint + Vitest.
   Must be green before proceeding.
8. **Regression** — `qa` walks
   `.agents/qa/regression-checklist.md` for the affected surfaces;
   `playwright-specialist` runs the regression spec set. Failures loop
   back to step 5.
9. **Human documentation** — `tech-writer` (with first-authors) updates
   `docs/**` so a new contributor can read about the feature without
   spelunking the diff.
10. **Constitution updates** — review and update, in this order:
    `CLAUDE.md`, `docs/ARCHITECTURE.md`, `.agents/RESPONSIBILITIES.md`,
    `docs/TZ.md`. If none need an update, state so explicitly.

### Rules of execution

- **Unconditional.** No step is skipped because "it's small". A step
  that doesn't apply is acknowledged in writing ("step 2 skipped, no UI
  change") — silence is not allowed.
- **Distributed.** Every step is delegated to the agent that owns it.
  The orchestrator does not write the code, the tests, or the docs
  itself.
- **Sequential gates.** A step's output is the input to the next. Don't
  start implementation before the test plan is red.
- **One feature, one trigger.** The `feature` word starts one pipeline.
  Splitting a feature into multiple pipelines requires breaking the
  prompt into multiple `feature ...` prompts.
