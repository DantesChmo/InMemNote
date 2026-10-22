# ADR 0007 — Test fakes of domain ports live in `src/test/fakes/`

- **Status**: Accepted
- **Date**: 2026-10-22
- **Related**: ADR 0005 (boundary lint, which left application specs exempt
  and named `src/test/` as the follow-up); bug #03 (in-memory storage
  fallback)

## Context

ADR 0005 made layer boundaries an ESLint rule but left one exemption:
`ignores: ['src/application/**/*.spec.ts']`. Thirteen use-case specs import
`InMemory{Draft,Note,Settings}Repository` from
`@infrastructure/persistence/` and `FixedClock` from
`@infrastructure/SystemClock`. That is an `application → infrastructure`
edge, and the exemption also hides any new one.

The four classes are not the same kind of thing:

- **`InMemory*Repository` are production adapters.** Since bug #03,
  `infrastructure/electron/main/composition.ts` falls back to them when
  SQLite fails to open, and `composition.spec.ts` asserts that with
  `toBeInstanceOf`. They have their own specs in `infrastructure/persistence/`.
- **`FixedClock` is used only by tests.** It sits in
  `infrastructure/SystemClock.ts` only because `SystemClock` is there.

The docs disagree on where fakes go. `docs/TESTING.md` says
`src/domain/<ctx>/__fakes__/`, but no such folder exists. ADR 0005 and the
open question in `docs/TZ.md` say `src/test/`, which is already test-only
(Vitest setup, the `window.inmemnote` mock, the shell sandbox) and is
excluded from coverage.

Constraints: production code must never import test-only code; production
behaviour must not change. Parallel work is editing `composition.ts` (SQLite
lifecycle) and `InMemoryNoteRepository.ts` (note deletion), so this change
should not touch either file.

## Decision

**Use-case specs use dedicated test fakes in `src/test/fakes/`. The
production in-memory adapters stay in infrastructure, unchanged.**

```
src/test/fakes/
  FixedClock.ts               moved verbatim from infrastructure/SystemClock.ts
  FakeDraftRepository.ts      implements DraftRepository
  FakeNoteRepository.ts       implements NoteRepository (incl. the ordering
                              contract: pinned first, then updatedAt DESC)
  FakeSettingsRepository.ts   implements SettingsRepository
```

- **What a fake is.** A fake is a test double of a domain port. It imports
  only `@domain/*`, `@shared/*` and test tooling. Its behaviour must match
  the port contract that the adapters honour. If it did not, the use-case
  specs would be testing a different system (Liskov, `CLAUDE.md` §4).
- **Names differ from the adapters** (`Fake*`, not `InMemory*`). An IDE
  auto-import then cannot quietly pick the infrastructure class, and a reader
  can tell the two apart.
- **No barrel.** Specs import each file directly
  (`@test/fakes/FakeNoteRepository`). A barrel in `src/test/` would also make
  a bare `../test` import possible, which the lint patterns below do not
  cover.
- **Alias `@test/*` → `src/test/*`** goes in `tsconfig.json` and
  `vitest.config.ts` **only**. It is deliberately left out of
  `vite.{main,preload,renderer}.config.ts`, so production code that imports
  `@test/...` also fails to bundle. This repeats the trick the renderer
  config already uses with `@infrastructure` (ADR 0005).
- **`src/test/` sits at the bottom of the dependency graph.** It may import
  domain, shared, Node built-ins and test tooling. It may not import
  application, infrastructure, presentation, `electron` or `better-sqlite3`.
  That is what makes it importable from every layer's specs. If `src/test`
  could re-export infrastructure, an application spec could reach
  infrastructure through it, which is laundering. A harness that needs a
  higher layer, such as a render helper wired to the Redux store, belongs
  in that layer (for example `src/presentation/test-utils/`) under that
  layer's rules.

### Boundary lint (`eslint.config.mjs`)

1. **Application block:** remove `ignores: ['src/application/**/*.spec.ts']`
   and its comment. Use-case specs follow the same rule as use-cases.
2. **New block, production never imports `src/test`.** It uses
   `@typescript-eslint/no-restricted-imports`, a separate rule key from core
   `no-restricted-imports`. Under flat config, a later block that sets the
   same rule replaces its options; it does not merge them. Using the other
   key lets this guard coexist with every per-layer block without copying
   their patterns:

   ```js
   // Test-support code is for specs only (ADR 0007). Uses the typescript-eslint
   // variant of the rule so it stacks with the per-layer core-rule blocks above
   // instead of overriding them.
   {
     files: ['src/**/*.{ts,tsx}'],
     ignores: ['src/**/*.{spec,test}.{ts,tsx}', 'src/test/**'],
     rules: {
       '@typescript-eslint/no-restricted-imports': [
         'error',
         {
           patterns: [
             {
               group: ['@test/*', '**/test/**'],
               message: 'src/test is test-only support code; production code must never import it.',
             },
           ],
         },
       ],
     },
   },
   ```

3. **New block for `src/test/**` itself:**

   ```js
   {
     files: ['src/test/**/*.{ts,tsx}'],
     rules: {
       'no-restricted-imports': [
         'error',
         {
           paths: ['electron', 'better-sqlite3'],
           patterns: [
             {
               group: [
                 '@application/*',
                 '**/application/**',
                 '@infrastructure/*',
                 '**/infrastructure/**',
                 '@presentation/*',
                 '**/presentation/**',
               ],
               message:
                 'src/test may import only domain, shared and test tooling (ADR 0007); re-exporting another layer here would launder a boundary violation.',
             },
           ],
         },
       ],
     },
   },
   ```

The patterns were checked against ESLint 9.39 / typescript-eslint 8.60. Both
rules report on the same file independently. `@test/fakes/X` and
`../../test/fakes/X` are caught. `@testing-library/*`, `@playwright/test`,
`node:test` and `./__tests__/*` are not.

## Consequences

- The boundary lint has **no exemption** for any layer. The
  "application specs → infrastructure" entry leaves the known deviations
  in `docs/ARCHITECTURE.md`.
- `composition.ts`, `composition.spec.ts`, the three `InMemory*Repository`
  sources and their specs are **untouched**. `SystemClock.ts` loses
  `FixedClock`; nothing in production used it. Behaviour does not change.
- **Cost: duplication.** There are now two in-memory implementations of each
  repository port, about 100 lines in total, and the "pinned first, then
  `updatedAt` DESC" ordering is written three times (SQLite, in-memory
  adapter, fake). This is accepted: the adapter and the fake change for
  different reasons. The adapter is a production fallback and follows
  production needs. The fake follows test needs, and may gain test-only
  features such as failure injection that a production class must not
  have. A change to a port's signature breaks every implementation at
  `tsc` time, because each one `implements` the port. A change in
  *behaviour* does not, so it has to be mirrored by hand.
- **Follow-ups, not part of this change:**
  - (a) If the ordering rule changes again, move it into a pure domain
    function (`domain/note/`) that all in-memory implementations call.
  - (b) If the fakes and adapters drift, add one shared
    port-contract suite (`src/test/contracts/<Port>.contract.ts`, exporting a
    `describe` factory) and run it against the fake, the in-memory adapter
    and the SQLite adapter.
  - Both touch `InMemoryNoteRepository.ts`, so they wait until the
    note-deletion work merges.
- The JSDoc on the `InMemory*Repository` classes ("used by tests…") goes
  stale. Fix it for Draft and Settings now; fix it for Note after the
  note-deletion branch merges.
- `docs/TESTING.md` "Fakes" is rewritten. Its `__fakes__` convention was
  never implemented.
- ADR 0005's closing "tolerated debt" item is resolved by this ADR. ADR 0005
  itself stays as written.

## Alternatives considered

- **Move the `InMemory*` adapters to `src/test/`, or re-export them from a
  `src/test` barrel.** Moving them would make `composition.ts` import
  test-only code, and it touches both files under parallel edit. A
  re-export barrel launders the edge. The specs would still execute
  infrastructure code and only the import path would hide it. Rejected.
- **Move the `InMemory*` adapters into `src/domain/<ctx>/` (or
  `__fakes__/`).** Imports would be legal, since infrastructure may import
  domain. But it puts adapters into the domain layer, edits `composition.ts`
  imports, and renames a file that is being edited in parallel. Rejected:
  a production adapter does not belong in domain.
- **Fakes under `src/domain/<ctx>/__fakes__/`** (the old `TESTING.md` text).
  Placing a fake next to its port reads well. But it scatters test-only code
  through the production tree. It needs a coverage exclusion and a
  production-import guard per folder. It would also be a second test-support
  home next to `src/test/`. Rejected in favour of one test-only root that is
  already excluded from coverage.
- **A narrow exemption** that lets application specs import only
  `@infrastructure/persistence/InMemory*`. This is honest about what it
  does, but it is still an exemption and keeps an `application →
  infrastructure` edge. Rejected.
- **Hand-written fakes inside each spec** (as the update use-case specs
  already do for `ReleaseGateway`). That would mean thirteen copies of three
  repositories. Rejected for repositories; still fine for one-off doubles of
  narrow ports.
