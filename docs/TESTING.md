# Testing convention

> Owned by the `test-specialist` agent. Every test author — human or agent —
> defers to this document. If your work would violate the convention,
> update this doc first (with a note on why), then write code.

## What goes where

| Scope | Tool | Location | What it covers |
|---|---|---|---|
| Domain | Vitest | `Foo.spec.ts` next to `Foo.ts` | pure entities, value objects, invariants |
| Application | Vitest | `UseCase.spec.ts` next to use-case | use-cases against in-memory repository fakes |
| Infrastructure | Vitest | `Adapter.spec.ts` next to adapter | integration against a **real** SQLite file in a temp dir |
| Presentation | Vitest + RTL | `Component.spec.tsx` next to component | stateful components — not trivial markup |
| E2E | Playwright | `e2e/**/*.spec.ts` | full flows against the real Electron app — owned by `playwright-specialist` |

## Conventions

- **TDD pipeline** (CLAUDE.md §4): interface → red test → green
  implementation → refactor.
- **Test behaviour, not implementation.** Renaming an internal symbol must
  not break tests.
- **No mocking what you own.** Mock at ports (`DraftRepository`), never at
  entities or use-cases.
- **No mock-call-count assertions.** Assert on observable outcomes.
- **Deterministic clocks / IDs**: inject them. Do not stub `Date.now`
  globally.
- **RTL queries** in priority order: by role, by label, by text. Test-ids
  only when nothing else identifies the element.
- **No snapshot tests** for things expected to change frequently.

## Fakes

- `InMemoryDraftRepository` lives in `src/domain/draft/` (or wherever the
  port is) under a `__fakes__/` sub-folder. It is the canonical fake; do
  not roll your own per test.

## Coverage targets

- Domain: 100% line coverage is the goal — easy to hit because the layer
  is pure.
- Application: every use-case has at least one happy-path and one error
  branch test.
- Infrastructure: every public adapter method.
- Presentation: every conditional render path of stateful components.

## Running tests

- Unit + component + integration: `npx vitest run`.
- E2E: `npx playwright test` — but see `playwright-specialist`'s plan in
  `.agents/playwright/test-plan.md` for which specs to run when debugging.
