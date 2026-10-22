# Architecture — current state

> Owned by the `architector` agent. This is a **living snapshot** of how the
> code is actually shaped right now. After every architectural change, this
> document must be updated in the same session. If code and this doc
> disagree, that is drift — surface it, don't paper over it.
>
> The **principles** (layering, SOLID, DDD, TDD pipeline) live in
> `CLAUDE.md` §3–§4. This document is about the **current shape**, not the
> rules. The *why* behind individual decisions lives in [`adr/`](./adr/).
>
> Snapshot as of v0.6.0 (milestones V1–V2.3 closed).

## Layers (recap, see `CLAUDE.md §3`)

```
presentation → application → domain
infrastructure ↦ ports declared in domain / application
domain depends on nothing
```

`src/shared/` holds only `Result.ts` (`Result<T, E>`, `ok`, `err`). It is the
one module `domain` imports from outside itself; it has no dependencies of
its own.

## Bounded contexts

| Context | Source roots | Status | Notes |
|---|---|---|---|
| Draft (quick capture) | `src/{domain,application,presentation}/draft/` | V1 / V1.1 done | global hotkey → overlay → autosave; `⌘↵` promotes into Library |
| Pin (sticky on top) | part of Draft — `DraftNote.pinned`, `TogglePinUseCase`, `DraftWindowController` pinned mode | done | not a separate context: a pinned Draft is the same aggregate and the same window in a compact, always-on-top mode |
| Note / Library | `src/{domain,application}/note/`, `src/presentation/library/` | V2 done | the domain calls it `Note`; the UI surface is called Library |
| Settings | `src/{domain,application,presentation}/settings/` | V2.1 / V2.2 done | theme, palette overrides, `openDraft` hotkey, language |
| Update | `src/{domain,application,presentation}/update/`, `src/infrastructure/update/` | V2.3 done | signing-free self-updater, see [ADR 0002](./adr/0002-signing-free-self-updater.md) |
| i18n | `src/presentation/i18n/` | V2.2 done | presentation-only: typed `MessageKey` catalog + `useTranslation()`; the domain stays language-agnostic, the chosen `LanguageMode` lives in Settings |

### Domain model

| Context | Aggregates / entities | Value objects | Errors |
|---|---|---|---|
| Draft | `DraftNote` | `DraftId`, `NoteContent` | `application/draft/errors.ts`; domain events in `domain/draft/events.ts` |
| Note | `Note` | `NoteId` (re-uses `NoteContent` from Draft) | `application/note/errors.ts` |
| Settings | `AppSettings` (singleton, no id) | `ThemeMode`, `Hotkey`, `PaletteOverrides`, `LanguageMode` | parse errors from `AppSettingsParse.fromPlain` |
| Update | — | `AppVersion` (numeric semver compare), `ReleaseInfo` | `domain/update/errors.ts` |
| shared | — | — | `DomainError` (abstract base) |

`Note` is deliberately a separate aggregate from `DraftNote`: a Draft is the
single scratch buffer, a Note is a library item. `PromoteDraftToNoteUseCase`
is the only place that crosses the two.

## Ports (declared in `domain`)

| Port | Declared in | Adapters | Notes |
|---|---|---|---|
| `DraftRepository` | `src/domain/draft/DraftRepository.ts` | `SqliteDraftRepository`; `InMemoryDraftRepository` (tests + fallback) | `save` is an upsert; `findLatest` restores the scratch buffer |
| `NoteRepository` | `src/domain/note/NoteRepository.ts` | `SqliteNoteRepository`; `InMemoryNoteRepository` (tests + fallback) | ordering contract lives in the port: pinned first, then `updatedAt` DESC |
| `SettingsRepository` | `src/domain/settings/SettingsRepository.ts` | `SqliteSettingsRepository`; `InMemorySettingsRepository` (tests + fallback) | `load()` returns `null` when nothing was ever saved |
| `ReleaseGateway` | `src/domain/update/ReleaseGateway.ts` | `GithubReleaseGateway` (`infrastructure/update/`); fail-soft stub under E2E | reads the anonymous GitHub Releases API |
| `UpdateInstaller` | `src/domain/update/UpdateInstaller.ts` | `DmgSelfUpdater` (`infrastructure/update/`) | a successful `install` never returns — the app quits |
| `Clock` | `src/domain/shared/Clock.ts` | `SystemClock`; `FixedClock` (tests) — both in `src/infrastructure/SystemClock.ts` | the domain never reads `Date.now()` |

## Use-cases (`src/application/`)

| Context | Use-cases | Ports used |
|---|---|---|
| draft | `OpenDraft`, `SaveDraft`, `TogglePin`, `CloseDraft` | `DraftRepository`, `Clock` |
| note | `ListNotes`, `FindNote`, `CreateNote`, `UpdateNoteContent`, `ToggleNotePin`, `DeleteNote`, `SearchNotes`, `PromoteDraftToNote` | `NoteRepository`, `Clock` (+ `DraftRepository` for promote) |
| settings | `LoadSettings`, `UpdateSettings` | `SettingsRepository` |
| update | `CheckForUpdate`, `InstallUpdate` | `ReleaseGateway`, `UpdateInstaller` |

Every use-case class is `<Name>UseCase.ts` with a co-located `.spec.ts`.
Expected failures come back as `Result`, never as a throw across layers.

## Composition

- `src/infrastructure/electron/main/composition.ts` — `buildContainer()` is
  the composition root for the Draft, Note and Settings contexts. Each SQLite
  repository is constructed in its own `try/catch` and falls back to its
  in-memory twin **independently**: one broken table doesn't take the others
  down.
- The Update context is wired separately in `main/index.ts`
  (`setupAutoUpdate()`), because its adapters depend on `app.getVersion()`,
  the E2E switch and the progress broadcast to all windows.

## Cross-process topology (Electron)

| Process | Source root | Responsibility |
|---|---|---|
| main | `src/infrastructure/electron/main/` | app lifecycle (`index.ts`), composition root, global hotkey (`hotkey.ts` — `HotkeyService`), IPC handlers (`ipc/{draft,notes,settings,update}.ts`), window controllers (`windows/`), domain → DTO mapping (`dto.ts`), renderer loading (`renderer.ts`), E2E affordances (`e2e.ts`) |
| preload | `src/infrastructure/electron/preload/index.ts` | `contextBridge` → `window.inmemnote.{draft,notes,settings,update}`; plus `window.__inmemnote_test__` only under `INMEMNOTE_E2E=1` |
| renderer | `src/presentation/` | React 18 + Redux Toolkit UI for both windows |

Channel names and DTO types live in
`src/infrastructure/electron/ipc-channels.ts`. Contracts are documented in
[`IPC.md`](./IPC.md).

Main → renderer broadcasts that keep both windows in sync:
`notes:changed` (after any note mutation, including Draft promote),
`settings:changed` (initial push after load + every save),
`update:available` and `update:progress`.

### Windows

One renderer bundle, two `BrowserWindow`s, routed by `?view=draft|library`
(see [ADR 0003](./adr/0003-two-windows-one-renderer-bundle.md)):

| Window | Controller | Shape |
|---|---|---|
| Library | `windows/LibraryWindowController.ts` | main app window, Dock icon, `titleBarStyle: 'hiddenInset'`, opened at launch and on `activate` |
| Draft | `windows/DraftWindowController.ts` (+ `draft-geometry.ts`, `draft-types.ts`) | frameless overlay, hides on blur unless pinned; owns pin mode, FLIP morph, drag-to-corner and manual resize; `setContentProtection(true)` always |

`renderer.ts` loads the same entry for both (`loadURL(...?view=)` in dev,
`loadFile(..., { query: { view } })` in production). `App.tsx` reads the
query once and mounts `DraftPanel` or `LibraryWindow`; anything else defaults
to Library. Both windows share one Redux store definition
(`presentation/app/store.ts`), each with its own instance.

### Native addon

`@inmemnote/window-events` (`native/window-events/`, Swift + ObjC++ N-API
shim) gives `DraftWindowController` global mouse up/down/drag hooks and a
header hover sensor. It is consumed only by that controller. Details:
[`NATIVE.md`](./NATIVE.md).

## Presentation

| Folder | Contents |
|---|---|
| `app/` | `main.tsx` (renderer entry, appearance bootstrap, settings subscription), `App.tsx` (`?view=` routing), `store.ts` |
| `draft/` | `DraftPanel`, `DraftHeader`, `DraftFooter`, `ResizeHandle`, `slice.ts`; `editor/` holds the shared `CodeMirrorEditor` and `inmemnoteMarkdownExtensions` (also used by the Library editor) |
| `library/` | `LibraryWindow`, `LibraryToolbar`, `LibrarySidebar`, `LibraryNoteList`, `LibraryEditor`, `slice.ts`, helpers `highlight.ts` / `preview.ts` |
| `settings/` | `SettingsPopup` (modal inside the Library window, not a separate window), `PaletteEditor`, `HotkeyInput`, `applyTheme.ts`, `slice.ts` |
| `update/` | `UpdateBanner`, `slice.ts` |
| `i18n/` | `messages.ts`, `translations.{en,ru}.ts`, `resolveLocale.ts`, `useTranslation.ts` |
| `theme/` | `tokens.css` (design tokens) |
| `types/` | `global.d.ts` — types `window.inmemnote` from the preload API |

## Configuration

Effective `openDraft` accelerator, highest precedence first (`HotkeyService`):

1. `AppSettings` row in SQLite (set from the Settings popup).
2. User YAML override: `~/Library/Application Support/Inmemnote/hotkeys.yaml`.
3. Shipped defaults: `config/hotkeys.yaml`.
4. Hard-coded fallback in `loadHotkeys` (`infrastructure/config/HotkeysConfig.ts`).

YAML is Zod-validated at startup; an invalid user file falls back to defaults
and logs. Under E2E the `globalShortcut` registration is disabled entirely.

## Persistence

- `better-sqlite3` (synchronous), one file: `<userData>/inmemnote.db`.
- Each SQLite repository opens its own connection to that file in WAL mode
  and creates its table with `CREATE TABLE IF NOT EXISTS` in its constructor:
  - `drafts(id, content, pinned, created_at, updated_at)`
  - `notes(...)` with indexes on `updated_at DESC` and `(pinned DESC, updated_at DESC)`
  - `settings(key TEXT PK, value TEXT NOT NULL)` — one JSON-encoded row per `AppSettings` field
- There is no migration runner on this branch: schema changes rely on
  `IF NOT EXISTS` plus additive, JSON-encoded settings values.
- Repositories wrap prepared statements. Multi-row writes inside one
  repository are transactional (`SqliteSettingsRepository.save`).
  `PromoteDraftToNoteUseCase` spans two repositories — and therefore two
  connections — so "save note, then delete draft" is two separate writes,
  not one transaction.

## Test-mode hooks

Inert unless the binary is launched with these env variables (all handled in
`main/index.ts`, `main/e2e.ts` and preload):

- `INMEMNOTE_USER_DATA` — redirects `userData` to a fresh tmp dir per test.
- `INMEMNOTE_E2E=1` — registers `__test__:showDraft` / `__test__:hideDraft`,
  exposes `window.__inmemnote_test__` and `globalThis.__inmemnoteTest`,
  disables the global hotkey, stubs the release gateway to fail soft and
  skips the update timers.

## Known deviations from `CLAUDE.md §3`

Surfaced here rather than papered over; none is fixed on this branch.

- **presentation → infrastructure (type-only).** Several presentation
  modules import DTO types from `@infrastructure/electron/ipc-channels`
  (`app/main.tsx`, `library/slice.ts`, `settings/{slice,applyTheme,
  SettingsPopup,PaletteEditor}`, `update/slice.ts`) and `types/global.d.ts`
  imports `InmemnoteAPI` from the preload module. These are `import type`
  only — nothing crosses at runtime — but the edge is not in the dependency
  rule. Resolving it (e.g. moving the IPC contract types to a neutral
  module) is an open architecture question.
- **presentation → domain.** `settings/HotkeyInput`, `settings/PaletteEditor`
  and `i18n/{useTranslation,resolveLocale}` import domain value objects
  (`Hotkey`, `PaletteOverrides`, `LanguageMode`) directly instead of going
  through application. The dependency direction is legal transitively, but
  skips the application layer.

## ADRs

See [`adr/`](./adr/). Latest accepted ADRs override earlier ones; superseded
ADRs are not deleted, only marked `Superseded by NNNN`.

| # | Decision |
|---|---|
| [0001](./adr/0001-record-architecture-decisions.md) | Record architecture decisions |
| [0002](./adr/0002-signing-free-self-updater.md) | Signing-free self-updater instead of Squirrel / `update-electron-app` |
| [0003](./adr/0003-two-windows-one-renderer-bundle.md) | Two windows in one renderer bundle, routed by `?view=` |
