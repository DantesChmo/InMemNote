# ADR 0005 — IPC contracts live in `src/shared/ipc/`

- **Status**: Accepted
- **Date**: 2026-10-22

## Context

The IPC contract (channel names, DTOs, the `window.inmemnote` API type) lives
in `src/infrastructure/electron/ipc-channels.ts` and `preload/index.ts`
(`InmemnoteAPI = typeof api`). Presentation imports both, so the renderer
depends on infrastructure: a `CLAUDE.md` §3 violation that only works because
`import type` is erased (the renderer Vite config has no `@infrastructure`
alias). Six channels are still raw strings in main/preload, `Corner` is
duplicated, and inbound payloads are not Zod-validated as `docs/IPC.md`
requires. More channels are coming, so the home must be obvious and
merge-friendly.

Options: (A) `src/shared/ipc/`: reachable from every process and already
aliased everywhere. (B) `src/application/**`: channel names and the window
API are transport details, not use-case contracts. (C) a new `src/contracts/`
layer: clearest name, but it needs a new §3 layer and four alias edits, and
gives nothing (A) doesn't.

## Decision

**A.** The contract is a pure-TypeScript leaf module in `src/shared/ipc/`:

```
src/shared/ipc/
  draft.ts     DraftChannels (incl. hotkey, dragStart/End, animationStart/Done,
               cornerChanged), DraftDTO, Corner, DraftBridge interface
  notes.ts     NotesChannels, NoteDTO, NoteListFilterDTO, NotesBridge
  settings.ts  SettingsChannels, AppSettingsDTO, AppSettingsPatchDTO, SettingsBridge
  update.ts    UpdateChannels, AvailableUpdateDTO, UpdateBridge
  e2e.ts       E2eChannels ('__test__:*'), InmemnoteTestAPI
  channels.ts  IPC = { ...DraftChannels, ...NotesChannels, ... } as const; IpcChannel
  api.ts       interface InmemnoteAPI { draft: DraftBridge; notes: NotesBridge; ... }
  index.ts     barrel
```

- `InmemnoteAPI` is an explicit interface. Preload declares
  `const api: InmemnoteAPI = { ... }`; it never derives the type.
- `src/shared/**` imports nothing from `src/` outside `shared` and no third-party
  packages (no electron, react, sqlite, zod). Domain already imports
  `@shared/Result`, so any `shared → domain` import would be a cycle.
- **Zod schemas stay in main**, one per context next to its handler:
  `src/infrastructure/electron/main/ipc/<context>.schemas.ts`. Each schema
  validates the handler's argument tuple and uses
  `satisfies z.ZodType<…DTO>` against the shared type. The trust boundary is
  main, so validation belongs there. Neither the preload bundle nor the
  renderer loads zod.
- **Boundary lint** (`no-restricted-imports`, covering alias and relative
  forms): `presentation/**` (specs included) must not import `@infrastructure/*`
  or `electron`; `application/**` must not import infrastructure or
  presentation; `domain/**` and `shared/**` must not import any other layer or
  framework. Application specs (`*.spec.ts`) are exempt for now because they
  wire in-memory adapters.

**Adding a channel:** add the key to that context's `*Channels` map, its DTO,
and its method on the `*Bridge` interface. If the payload goes renderer→main,
add a schema in `main/ipc/<context>.schemas.ts`. Add the row to `docs/IPC.md`.
A new context gets a new file, plus one spread in `channels.ts` and one member
in `api.ts`. A spec asserts that channel values are unique across maps,
because spreading the maps would otherwise let a duplicate win silently.

## Consequences

- Presentation depends only on `@shared/ipc`, which removes the §3 violation.
  Lint then prevents it from coming back.
- `ipc-channels.ts` is deleted, and `main/windows/draft-types.ts` re-exports
  `Corner` from shared (or is removed).
- §3 changes in meaning: `shared` now also holds cross-process contracts. The
  `CLAUDE.md` text is updated.
- With `satisfies`, an optional DTO field added without a schema update is
  stripped silently. Schema specs must cover each DTO's full shape.
- Application specs that depend on `@infrastructure` in-memory adapters are
  tolerated debt. A follow-up may move them to `src/test/`.
