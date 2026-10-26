# Testing convention

> Owned by the `test-specialist` agent. Every test author — human or agent —
> defers to this document. If your work would violate the convention,
> update this doc first (with a note on why), then write code.

## What goes where

| Scope | Tool | Location | What it covers |
|---|---|---|---|
| Domain | Vitest | `Foo.spec.ts` next to `Foo.ts` | pure entities, value objects, invariants |
| Application | Vitest | `UseCase.spec.ts` next to use-case | use-cases against the fakes in `src/test/fakes/` |
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

- Fakes of domain ports live in `src/test/fakes/` — `FakeDraftRepository`,
  `FakeNoteRepository`, `FakeSettingsRepository`, `FixedClock` — and are
  imported directly as `@test/fakes/<Name>` (there is no barrel). They are
  the canonical fakes; do not roll your own repository fake per test.
  One-off doubles of a narrow port (e.g. `ReleaseGateway` in the update
  use-case specs) may stay inline in the spec.
- A fake honours its port's contract, because use-case specs assert on it
  (e.g. `NoteRepository` ordering: pinned first, then `updatedAt` DESC).
  When an adapter's behaviour changes, mirror it in the fake.
- `src/test/` may import only domain, shared and test tooling; production
  code never imports it. ESLint enforces both directions, and the `@test`
  alias exists only in `tsconfig.json` and `vitest.config.ts`, so a
  production import also fails to bundle
  ([ADR 0007](./adr/0007-test-fakes-in-src-test.md)).
- The `InMemory*Repository` classes in `src/infrastructure/persistence/` are
  the production fallback when SQLite fails to open (bug #03), not test
  fakes. Only infrastructure specs use them.
- A harness that needs a higher layer (say, a render helper wired to the
  Redux store) lives in that layer, e.g. `src/presentation/test-utils/`, and
  follows that layer's import rules.

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
