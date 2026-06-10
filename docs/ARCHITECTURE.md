# Architecture — current state

> Owned by the `architector` agent. This is a **living snapshot** of how the
> code is actually shaped right now. After every architectural change, this
> document must be updated in the same session. If code and this doc
> disagree, that is drift — surface it, don't paper over it.
>
> The **principles** (layering, SOLID, DDD, TDD pipeline) live in
> `CLAUDE.md` §3–§4. This document is about the **current shape**, not the
> rules.

## Layers (recap, see `CLAUDE.md §3`)

```
presentation → application → domain
infrastructure ↦ ports declared in domain / application
domain depends on nothing
```

## Bounded contexts

| Context | Source root | Status | Notes |
|---|---|---|---|
| Draft (quick capture) | `src/{domain,application,presentation}/draft/**` | V1 in progress | global hotkey → panel → save |
| Pin (sticky on top) | _(planned)_ | not started | promoted from a Draft |
| Library (browser) | _(planned)_ | not started | reads cold storage |

## Ports (declared in `domain` / `application`)

| Port | Declared in | Adapters | Notes |
|---|---|---|---|
| `DraftRepository` | `src/domain/draft/DraftRepository.ts` | SQLite (`infrastructure/persistence/sqlite/**`); in-memory (tests) | |

## Cross-process topology (Electron)

| Process | Source root | Responsibility |
|---|---|---|
| main | `src/infrastructure/electron/main/**` | window lifecycle, global shortcut, IPC handlers |
| preload | `src/infrastructure/electron/preload/**` | `contextBridge` — narrow typed surface to renderer |
| renderer | `src/presentation/**` | React + Redux UI |

IPC contracts are documented in [`IPC.md`](./IPC.md).

## Configuration

- Defaults: `config/hotkeys.yaml` (ships with the app).
- User override: `~/Library/Application Support/Inmemnote/hotkeys.yaml`.
- Validation: Zod at startup. Invalid user file → fall back + log.

## Persistence

- `better-sqlite3` (synchronous).
- One DB file under the Electron `userData` directory.
- Repositories wrap prepared statements; multi-statement writes are
  transactional.

## ADRs

See `docs/adr/`. Latest accepted ADRs override earlier ones; superseded ADRs
are not deleted, only marked `Superseded by NNNN`.
