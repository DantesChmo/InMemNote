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
| `DraftRepository` | `src/domain/draft/DraftRepository.ts` | SQLite (`infrastructure/persistence/sqlite/**`); in-memory (`infrastructure/persistence/**`) | |
| `NoteRepository` | `src/domain/note/NoteRepository.ts` | SQLite (`infrastructure/persistence/sqlite/**`); in-memory (`infrastructure/persistence/**`) | |
| `SettingsRepository` | `src/domain/settings/SettingsRepository.ts` | SQLite (`infrastructure/persistence/sqlite/**`); in-memory (`infrastructure/persistence/**`) | |

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

- `better-sqlite3` (synchronous), WAL journal mode.
- One DB file, `inmemnote.db`, under the Electron `userData` directory,
  opened through **one connection** owned by the composition root
  (`infrastructure/electron/main/composition.ts`).
- `infrastructure/persistence/sqlite/openDatabase.ts` — opens the file, sets
  WAL, runs migrations; on failure closes the handle and rethrows.
- `infrastructure/persistence/sqlite/migrations.ts` — ordered, contiguous
  `MIGRATIONS` (`{ version, name, up(db) }`) and `runMigrations`. Schema
  version lives in `PRAGMA user_version`; each step runs in its own
  transaction together with the version bump. Migration 1 is the baseline
  schema (`drafts`, `notes`, `settings` + indexes) and adopts pre-migration
  DBs (`user_version = 0`). A DB with a version newer than the app knows is
  refused. Released migrations are never edited.
- `Sqlite{Draft,Note,Settings}Repository` take an open `Database` in their
  constructor; they wrap prepared statements and own no pragmas, DDL, or
  lifecycle. Multi-statement writes are transactional.
- If opening/migrating fails, **all** repositories fall back to their
  in-memory adapters together (the open error is shared, not retried per
  repository; the file on disk is untouched).
- The connection is not yet closed on quit (follow-up).
- Why: [ADR 0002](./adr/0002-single-sqlite-connection-and-schema-migrations.md).

## ADRs

See `docs/adr/`. Latest accepted ADRs override earlier ones; superseded ADRs
are not deleted, only marked `Superseded by NNNN`.
