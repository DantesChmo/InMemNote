# ADR 0004 — Single SQLite connection and versioned schema migrations

- **Status**: Accepted
- **Date**: 2026-10-22

## Context

All three SQLite adapters (`SqliteDraftRepository`, `SqliteNoteRepository`,
`SqliteSettingsRepository`) each open their own `better-sqlite3` connection
to the same `userData/inmemnote.db`, set `journal_mode = WAL`, and run inline
`CREATE TABLE/INDEX IF NOT EXISTS` for their table. There is no schema
version (`PRAGMA user_version` is 0 in every released DB up to v0.6.0), so
the first change that is not expressible as `IF NOT EXISTS` (a new column, a
backfill, a renamed index) has nowhere safe to live. The composition root
builds each repository in its own try/catch, so one table can silently fall
back to in-memory while the others write to disk — a split-brain that makes
no sense for a single file behind a single native binding. Nothing closes
the connections in production.

## Decision

- **One connection per DB file, owned by the composition root.** A new
  infrastructure helper `openDatabase(path): Database.Database` opens the
  file, sets WAL, runs migrations, and on failure closes the handle and
  rethrows. `composition.ts` calls it once.
- **Repositories receive an open `Database.Database`** in their constructor
  and no longer own the connection: no pragmas, no DDL, no `close()`.
  Domain ports (`DraftRepository`, `NoteRepository`, `SettingsRepository`)
  are unchanged.
- **Versioned migrations** in `sqlite/migrations.ts`:
  `interface Migration { version: number; name: string; up(db): void }`, an
  ordered `MIGRATIONS` array, and `runMigrations(db, migrations = MIGRATIONS)`.
  The runner validates that versions are contiguous `1..N`, reads
  `user_version`, and applies each pending migration in its own transaction
  that also sets `PRAGMA user_version = n` (DDL and `user_version` are both
  transactional in SQLite, so a failing step rolls back completely).
  The version check is repeated inside an `IMMEDIATE` transaction so two
  concurrently started app instances (there is no single-instance lock)
  cannot apply the same step twice.
- **A DB newer than the app is refused**: `user_version` greater than the
  latest known version throws, rather than letting old code write to a
  schema it does not understand.
- **Migration 1 is the current schema written with `IF NOT EXISTS`.** It
  adopts an existing v0.6.0 DB (tables present, version 0) without data loss
  and creates `settings` on older DBs that predate it. Every later migration
  is a plain forward step. **Released migrations are never edited**; a fix is
  a new migration.
- **All-or-nothing fallback**: the connection is opened lazily, once, by the
  first repository that needs it; a failed open is remembered and rethrown
  to every repository, so all three fall back to in-memory together (the
  per-repository try/catch in the composition root stays, which keeps a
  failing repository *constructor* isolated).

## Consequences

- Schema changes now have a defined, testable home; `user_version` becomes
  the single source of truth for "what shape is this file".
- No partial fallback: either everything persists or nothing does (and the
  file on disk is left untouched, including a too-new DB).
- Multiple connections per file are no longer the production shape. Specs
  that open two repos on one file to simulate cross-connection visibility
  describe a scenario production no longer has; they should share one
  handle.
- Repository specs open their DB via `openDatabase` against a real
  temp-file DB (see `docs/TESTING.md`), so they exercise the migrations too.
  `runMigrations` gets its own spec (contiguity, adopt-v0, newer-version
  refusal, rollback on failure).
- Everything stays in `infrastructure`; no new dependency, no §3 impact.
- Follow-up (out of scope here): close the connection on app quit, after
  the pending-autosave flush. Until then the OS reclaims the handle; WAL
  keeps the file consistent.
