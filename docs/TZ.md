# TZ — Inmemnote spec

This document is project state. Any session (including the agent after a
context loss) should be able to continue work by reading this file +
`CLAUDE.md` + skimming `design/`.

Checkbox format: `[ ]` — not done, `[~]` — in progress, `[x]` — done.

---

## 0. Roadmap (high-level)

- [x] **V1 — Draft.** Quick-capture overlay, pin-on-top, local SQLite,
  default hotkey `⌘⇧Space`.
- [x] **V1.1 — Draft polish.** Custom CM6 decorators (markers hidden on
  inactive lines, blockquote with accent stripe), Tab/Shift+Tab, dynamic
  window resize, corner positioning for pin, FLIP morph.
- [x] **V2 — Library.** Main application window (Dock + Launchpad). Sidebar
  (All / Pinned), card list with search, editor; promote-on-⌘↵ moves the
  scratch draft into the library. Tags are out of scope for V2.
- [x] **V2.1 — Settings.** Modal popup launched from a gear icon in the
  Library toolbar. Persists in SQLite (`settings` table). Configures the
  palette (theme + per-token color picker) and the global hotkey.
- [x] **V2.2 — i18n.** English + Russian dictionaries, system-locale
  default, language picker in Settings. Typed `MessageKey` union enforces
  full coverage at compile time.
- [ ] **E2E.** Full coverage of user-facing flows with Playwright + Electron.
- [x] **V2.3 — Auto-update.** Signing-free self-updater: the app polls the
  GitHub Releases feed, and a one-click banner downloads the DMG and swaps
  the bundle in place via a detached helper (no Apple Developer ID, no
  Squirrel). See §4d.

---

## 1. Project infrastructure

- [x] `CLAUDE.md` — constitution, stack, rules.
- [x] `docs/TZ.md` — this file.
- [x] `docs/HOTKEYS.md` — hotkey config format.
- [x] Electron Forge + Vite + TS + React initialized.
- [x] Tailwind CSS + design tokens for the palette
  (`src/presentation/theme/tokens.css`).
- [x] ESLint + Prettier + EditorConfig + husky/lint-staged.
- [x] `.husky/pre-commit` committed (lint-staged + `tsc --noEmit`) — until
  2026-10-22 only the `prepare` script existed, so the hook never ran.
- [x] Node pinned: `.nvmrc` (22) drives CI's `actions/setup-node`;
  `package.json` `engines` declares `node >=22`.
- [x] Vitest + RTL.
- [x] Playwright (electron) — config in place, smoke test in V2.
- [~] Runtime/toolchain upgrade (2026-10-22): Electron 33 → 45,
  better-sqlite3 11 → 13, Electron Forge 7 → 8 (+ Vite 8, Vitest 5,
  `@vitejs/plugin-react` 6, `@electron/fuses` 2). tsc/ESLint/Vitest and
  `electron-forge package` green locally; E2E pending (see §5 entry).
- [x] Content-Security-Policy in the renderer (`<meta>` injected by the
  `inmemnote:csp` plugin in `vite.renderer.config.ts`; strict in prod,
  relaxed for Vite HMR in dev). Covered by `e2e/cross-window/csp.spec.ts`.
- [x] DDD directory structure (domain/application/infrastructure/presentation).
- [x] Release pipeline (2026-10-22, ADR 0006): `release.yml` on `v*` tags,
  gated on `ci.yml` (reusable); versioned + stable DMG assets; optional
  Developer ID signing/notarization; Homebrew cask via `homebrew.yml`.
  DMG is the primary install channel, `curl` the alternative. See
  `docs/RELEASING.md`.

---

## 2. Draft — functional requirements (V1)

### 2.1 Summon and close
- [x] Opens via a global hotkey (default `CommandOrControl+Shift+Space`).
- [x] The hotkey is read from `config/hotkeys.yaml`, overridable via a user
  file at `~/Library/Application Support/Inmemnote/hotkeys.yaml`.
- [x] Pressing the hotkey again while the panel is open hides it.
- [x] `Esc` closes Draft (if not pinned) with autosave.
- [x] `⌘↵` saves and closes.
- [x] On re-summon, Draft returns with the last scratch buffer if it's
  non-empty and hasn't been explicitly "released" to Library.

### 2.2 Window behavior
- [x] Floats above every window (Spotlight-style); no Dock icon and no menu.
- [x] Centered on the display under the cursor (multi-display aware).
- [x] Frame is hidden (`frame: false`), 16 px corner radius, design-spec shadow.
- [x] Fixed width **560 px**. Height is content-driven via a renderer-side
  `ResizeObserver` + `draft:resize` IPC, clamped to `[96, 60vh]` in main.
- [x] Drag the panel by the header (drag region on the header).
- [x] Hidden from screen-capture (Zoom / Meet / QuickTime / ScreenCaptureKit)
  via macOS `NSWindowSharingNone` (Electron's `setContentProtection(true)`).
  Applied unconditionally — both pinned and un-pinned — because the scratch
  buffer can hold sensitive text at any moment.

### 2.3 Pin
- [x] Pin button in the top-right of the header.
- [x] On activation:
  - the window stays "always on top" (`alwaysOnTop: true`, level `floating`);
  - shrinks to compact form (width **320 px**, header **40 px**, no footer,
    body `max-height: 180`).
- [x] Corner positioning (`top-right`, 24 px inset) on pin; multiple
  stickers are out of V3.
- [x] On unpin — returns to full form and re-centers on the cursor display.
- [x] FLIP morph animation (360 ms, `cubic-bezier(.22,.7,.3,1)`) on
  pin/unpin via the Web Animations API.

### 2.4 Editor (CodeMirror 6, markdown)
- [x] Markdown highlighting (`@codemirror/lang-markdown`).
- [x] "Markers" (`#`, `>`, `-`, `1.`, `[ ]`) only visible on the active
  line — custom ViewPlugin + `Decoration.replace` in
  `inmemnoteMarkdownExtensions.ts`.
- [x] Inline styles `**bold**`, `*italic*`, `` `code` `` (native to
  lang-markdown).
- [x] Headings `# / ## / ###` (full line styled via `cm-inmem-h*` line
  decorations + HighlightStyle).
- [x] Blockquotes `>` with accent left border (Decoration.line +
  `cm-inmem-quote` CSS class).
- [x] Lists `-` / `1.` / `[ ]` (native in lang-markdown).
- [x] `⌘↵` saves and hides; `Esc` cancels with autosave. The editor's own
  `Mod-Enter` / `Escape` bindings precede `defaultKeymap` (which maps
  `Mod-Enter` to `insertBlankLine`), always call the latest parent callbacks
  and stop propagation once handled, so DraftPanel's document-level fallback
  never fires a second time — bugs #06, #07, 2026-10-22.
- [x] An external `value` sync is not echoed back through `onChange` (the
  sync transaction is annotated and skipped) — bug #08, 2026-10-22.
- [x] `Tab` / `Shift+Tab` nest lists via `indentMore`/`indentLess`.

### 2.5 Persistence
- [x] Debounced autosave (500 ms after the last keystroke). A pending edit
  is flushed (never dropped) on app quit, auto-update relaunch and Draft
  window destroy — bug #02, 2026-10-22.
- [x] Storage: SQLite (`better-sqlite3`), path `userData/inmemnote.db`.
- [x] Schema: `drafts(id TEXT PK, content TEXT, pinned INT, created_at,
  updated_at)` with an index on `updated_at DESC`.
- [x] Falls back to an in-memory repository if SQLite init fails.
- [x] One shared connection to `inmemnote.db`, opened and migrated in the
  composition root; repositories receive it and own no DDL (ADR 0004).
- [x] Versioned schema: ordered migrations in
  `infrastructure/persistence/sqlite/migrations.ts`, version stored in
  `PRAGMA user_version`. Migration 1 = baseline schema; it adopts v0.6.0
  files (tables present, `user_version = 0`) without data loss.
- [x] The fallback is never silent: the container records which stores
  degraded and why, main answers `storage:status`, Library shows a
  persistent banner and Draft a one-line strip when drafts/notes are in
  memory — bug #03, 2026-10-22. Write-time SQLite errors (after a
  successful open) are not covered by the banner.

### 2.6 Theme
- [x] Dark (primary) and light. Driven by the macOS system theme via
  `prefers-color-scheme` and a `data-theme` attribute on `<html>`.

### 2.7 Palette and typography (from `design/Inmemnote - Draft (hi-fi).html`)
- Accent: `#3f7d6b` (green — our choice; others are ignored).
- Dark: panel `#1c1b18`, text `#f3f1ec`, text-2 `#a39e95`, text-3 `#6f6a62`,
  line `rgba(255,255,255,.08)`.
- Light: panel `#fff`, text `#1c1b18`, text-2 `#6b665e`, text-3 `#9b968d`,
  line `rgba(0,0,0,.08)`.
- UI font: SF Pro Text (`-apple-system, BlinkMacSystemFont, "SF Pro Text",
  system-ui`).
- Mono font: SF Mono.
- Draft panel sizes: 560 × auto, r16, header 60, footer 46, body padding
  `20 24 24`.
- Pin sizes: 320 × auto, r14, header 40, no footer, body `max-height: 180`.

---

## 3. Architectural commitments

- [x] Domain layer with no dependencies on Electron/React/SQLite.
- [x] Use-cases return `Result<T, DomainError>` (`Save`, `TogglePin`).
- [x] Repositories are defined by interfaces in `domain`, implementations
  live in `infrastructure` (in-memory + SQLite).
- [x] IPC between main and renderer — a narrow typed bridge through
  `preload` (`window.inmemnote.draft.*`).
- [x] IPC contracts (channels, DTOs, `InmemnoteAPI`) in `src/shared/ipc/`,
  so presentation no longer imports `@infrastructure` (ADR 0005); layer
  boundaries enforced by ESLint `no-restricted-imports`, with no per-layer
  exemption since ADR 0007. Every inbound
  payload is Zod-validated main-side (`main/ipc/*.schemas.ts`) and a bad
  one rejects with `IpcValidationError` before any use-case runs. Channel
  table: `docs/IPC.md`.
- [x] One app process per userData directory: a second launch quits
  before any initialisation and the running instance resurfaces the
  Library (`claimSingleInstance`, taken after the `userData` override so
  parallel E2E instances still boot) — bug #05, 2026-10-22.

---

## 4. Open questions

> Bucket for anything we're not sure about — either for review or for a
> future session.

- Do we need to support **multiple** concurrent Pin stickers in V1, or is
  a single active pinned window enough? (The "Library prototype" mock
  hints at multiplicity — I deferred that to V3.)
- What does Draft show on first launch — an empty canvas or a welcome
  note?
- Do we need a menu-bar (tray) icon to enter Library? (Out of V1, but it
  affects how the process is laid out.)
- Hotkey behavior on macOS when focus is on a fullscreen app: confirm
  there's no conflict with Spotlight (`⌘Space`).
- The shared SQLite connection is never closed explicitly on quit (the
  OS reclaims it; WAL keeps the file consistent). Closing it belongs after
  the pending-autosave flush in the quit sequence — follow-up, see ADR 0004.
- Storage degradation is only detected when SQLite fails to *open*. Should
  a later write failure (disk full, DB file removed) also flip the app into
  the persistent "not saved" state? (bug #03 follow-up)
- `npm audit` (2026-10-22, after the Electron 45 upgrade) still reports
  high-severity advisories, mostly in dev tooling (Tailwind 3's
  chokidar/micromatch, `electron-installer-dmg` → `appdmg`), but also in
  the runtime dependency `js-yaml` (quadratic CPU on merge-key chains in
  the hotkeys YAML). Worth a dedicated dependency pass.
- The Library's undo-delete toast (2026-10-22) has unit coverage only. An
  e2e case (delete → Undo → the note is back; delete → wait → it is gone
  after a relaunch) still needs to be added to `.agents/playwright/test-plan.md`.

---

## 4a. Library — functional requirements (V2)

### 4a.1 Window
- [x] Main application window, visible Dock icon, opens at launch.
- [x] `titleBarStyle: 'hiddenInset'` — native macOS traffic lights, our
  content rendered underneath; drag region on the toolbar.
- [x] Size: 1100×720 default, min 720×480.
- [x] Re-opening from the Dock — `app.on('activate')` resurfaces it.

### 4a.2 Sidebar
- [x] "All notes" / "Pinned" with tab-style active selection.
- [x] Counts react to the Redux cache.
- [x] Tags are deferred (out of V2 by user decision).

### 4a.3 Note list
- [x] Cards: title (from the first non-empty line, with `#`/`>`/`-`/`1.`
  stripped), preview (2 lines, line-clamp), relative-updated, pin indicator.
- [x] Search-match highlight (`<mark class="lib-hl">`), HTML-safe.
- [x] Sort order: pinned first, then `updated DESC`
  (a `NoteRepository` contract).
- [x] Empty state for an empty filter and for "nothing found".

### 4a.4 Search
- [x] Toolbar input with `⌘F` focus shortcut.
- [x] Live search (`onChange` → `fetchNotes` thunk).
- [x] `Esc` in the input clears the query and the filter.
- [x] LIKE on `content` in SQLite, escaping `%` and `_`.

### 4a.5 Editor
- [x] Same `CodeMirrorEditor` as in Draft (shared markdown vocabulary).
- [x] Top bar: pinned state, modified, pin/delete buttons.
- [x] Footer: word count + ⌘↵ hint.
- [x] Empty state when no note is selected.
- [x] `key={note.id}` on CM forces a remount on note switch (isolates
  undo history).

### 4a.6 CRUD and shortcuts
- [x] `⌘N` creates a fresh empty note, selection jumps to it.
- [x] Auto-save 500 ms after the last keystroke. A pending edit is flushed
  (never dropped) on note switch, window close and app quit — bug #01,
  2026-10-22.
- [x] `⌘↵` in the Library editor — synchronous flush, no promote. (Until
  bug #06 was fixed, ⌘↵ here only inserted a blank line.)
- [x] Delete button — `deleteNote`; selection moves to the next note.
- [x] Delete is soft, with an undo toast (2026-10-22). The note leaves the
  list at once and the toast "Note deleted · Undo" shows for 6 s. Hovering
  or focusing the toast pauses the timer; when it resumes, it runs for
  whatever time is left, but never less than 2 s. ⌘Z also undoes, unless
  focus is in the editor or a text field. Undo restores the note and selects
  it again. The `notes:delete` IPC is sent only when the timer expires, on
  "×", on window unload, or when another note is deleted. Only one delete is
  pending at a time.
  - **Chosen over** a confirmation dialog, which people learn to click
    through, and a Trash section, which would need a migration plus new
    use-cases and IPC.
  - **Purely renderer-side.** Nothing changes in the DB, the domain or the
    IPC.
  - **If the app crashes inside those 6 s,** the note survives. That is the
    safe failure.
  - **Trade-off:** nothing can be undone once the toast has gone.

### 4a.7 Draft → Library
- [x] `⌘↵` in Draft fires `draft:promote`, not `draft:close`.
- [x] Empty drafts are NOT promoted (silently dropped).
- [x] `notes:changed` broadcast refreshes the open Library window.

### 4a.8 Architecture
- [x] Two windows inside one renderer bundle, routed by `?view=draft|library`.
- [x] Domain `Note` aggregate separate from `DraftNote`.
- [x] `NoteRepository` port + `SqliteNoteRepository` / `InMemoryNoteRepository`.
- [x] Use-cases: List / Find / Create / Update / TogglePin / Delete /
  Search / PromoteDraftToNote. Each returns `Result` where expected
  failures exist.
- [x] IPC: `notes:*` + `draft:promote` + `notes:changed` broadcast.

## 4b. Settings — functional requirements (V2.1)

### 4b.1 Entry and surface
- [x] Gear button in the Library toolbar (right of the search input).
- [x] Opens as a modal popup over the Library window (NOT a new BrowserWindow).
- [x] Dim layer click and `Escape` close the popup (and revert any
  unsaved live preview).
- [x] Two-pane layout inside the modal: section nav on the left
  (Палитра / Хоткеи) + content panel on the right.

### 4b.2 Палитра section
- [x] Theme switcher: `system` (default) / `dark` / `light`.
- [x] Color picker per token in `PALETTE_TOKEN_KEYS` (9 tokens: accent,
  accent-ink, panel, panel-2, sink, text, text-2, text-3, bar).
- [x] Each token row has a "Сброс" button that drops the override and
  returns the token to its theme default.
- [x] Live preview while the popup is open — palette and theme are applied
  to the DOM as the user drags the picker. Cancel rolls back to the last
  persisted state.

### 4b.3 Хоткеи section
- [x] V2.1 ships one binding: `openDraft`. The capture input listens to
  the next keystroke and validates the resulting accelerator through the
  domain `Hotkey.fromTokens` factory (same vocabulary as the YAML loader).
- [x] DB-stored hotkey wins over `config/hotkeys.yaml` and the user
  YAML override. YAML stays as a scripted-deploy escape hatch when no
  settings row exists yet.

### 4b.4 Persistence and IPC
- [x] New `settings(key TEXT PK, value TEXT NOT NULL)` table in
  `userData/inmemnote.db`. Each `AppSettings` field is one row; the value
  is JSON-encoded so adding a new preference doesn't require an `ALTER`.
- [x] `SqliteSettingsRepository` with `load()` / `save()`. Falls back to
  `InMemorySettingsRepository` if the SQLite table can't be created.
- [x] IPC: `settings:load`, `settings:save`, `settings:changed`
  (broadcast). The `save` path re-registers the global shortcut when the
  accelerator changed and emits `settings:changed` to every open window.
- [x] The popup sends a partial patch; main merges it with the current
  aggregate before re-validating through `AppSettingsParse.fromPlain` —
  no partial writes.

### 4b.5 Architecture
- [x] Domain: `AppSettings` aggregate + value objects (`ThemeMode`,
  `Hotkey`, `PaletteOverrides`). `Hotkey` owns the canonical accelerator
  vocabulary that the YAML loader, the UI capture component, and the
  IPC handler all share (`ALLOWED_KEY_TOKENS`).
- [x] Application: `LoadSettingsUseCase`, `UpdateSettingsUseCase`. The
  latter returns `Result<AppSettings, AppSettingsParseError>`.
- [x] Presentation: `presentation/settings/` (slice, `SettingsPopup`,
  `PaletteEditor`, `HotkeyInput`, `applyTheme`).
- [x] 36 unit tests covering the domain + use-cases.

---

## 4c. i18n — functional requirements (V2.2)

### 4c.1 Scope
- [x] Two locales: `en`, `ru`. Adding more is a `translations.<code>.ts`
  file + a one-line append to `LanguageMode`.
- [x] System locale resolution via `navigator.language` (renderer); when
  the system locale isn't supported, fall back to `en`.

### 4c.2 Storage & UI
- [x] New `language: 'system' | 'en' | 'ru'` field in `AppSettings`
  (persisted via the same key-value `settings` table as everything else).
- [x] Language picker as a third section in the Settings popup
  (Палитра / Хоткеи / Язык).
- [x] `<html lang="...">` is kept in sync with the resolved locale for
  a11y / spellcheck / `:lang()` CSS hooks.

### 4c.3 Implementation
- [x] All strings live in `src/presentation/i18n/messages.ts` as a typed
  `MessageKey` union. `translations.en.ts` and `translations.ru.ts` both
  satisfy the `Messages` type — TS forces every locale to provide a value
  for every key.
- [x] `useTranslation()` returns `{ t, locale }`; placeholder syntax is
  `{name}` (replaced positionally). No plural rules — for pluralization
  the calling code picks the key.
- [x] Domain `Note.title()` now returns `''` for blank notes; the
  presentation layer substitutes `library.untitled`. Domain stays
  language-agnostic.
- [x] 4 unit tests cover the hook (locale resolution, interpolation,
  missing-placeholder behavior, system fallback).

---

## 4d. Auto-update — functional requirements (V2.3)

### 4d.1 Approach and constraint
- [x] **No Apple Developer ID, no Squirrel.** `update-electron-app` /
  Squirrel.Mac refuse to apply an update whose code signature isn't a valid,
  matching Developer ID. This app ships ad-hoc-signed (see README), so
  Squirrel is a non-starter.
  Instead we reproduce `scripts/install.sh` from inside the app.
- [x] The update feed IS the GitHub Release `release.yml` already
  publishes — no backend of our own, keeping the "no cloud" promise.

### 4d.2 Detection
- [x] `GithubReleaseGateway` reads the anonymous GitHub Releases API
  (`/releases/latest`), parses `tag_name` → `AppVersion`, and resolves the
  DMG asset URL from the release's own asset list (falling back to the stable
  `/latest/download/` URL).
- [x] `CheckForUpdateUseCase` compares the feed version against
  `app.getVersion()` numerically (not lexicographically) and returns the
  release only when strictly newer. A feed failure is a soft `Result` error —
  offline is not an error the user sees.
- [x] Main checks 8 s after launch and every 6 h; the Library window also
  checks on mount. Found releases broadcast `update:available`.

### 4d.3 Install
- [x] `DmgSelfUpdater` downloads the DMG (streaming, with 0..1 progress),
  writes a detached `/bin/bash` helper, spawns it un-tethered and quits —
  but only after the child has actually started. `spawnDetached` resolves on
  the child's `spawn` event and rejects on `error`; a rejection skips the
  quit and surfaces through `InstallUpdateUseCase` as
  `UPDATE_INSTALL_FAILED`, so the banner shows the error and offers a retry
  instead of the app closing with nothing to relaunch it (bug #04).
- [x] The helper waits for the app's PID to exit (a live bundle can't be
  replaced), then `hdiutil attach` → swap → `hdiutil detach` →
  `xattr -dr com.apple.quarantine` → `open`. Because `cp` never quarantines,
  the relaunched build opens with no Gatekeeper prompt.
- [x] **The swap is atomic with rollback** (bug #04). The new bundle is
  copied to a hidden `.Inmemnote.app.new-<pid>` *inside the install
  directory* (same volume, so the following `mv`s are renames), checked for
  `Contents/Info.plist`, the old bundle is renamed to `.Inmemnote.app.old-<pid>`,
  the new one is renamed into place, and only then is the backup removed.
  Any failure (mount, copy, incomplete bundle, rename) removes the staging
  copy, restores the backup and relaunches the old version. The previous
  `rm -rf` + `cp -R` left no app at all when the copy failed.
  `scripts/install.sh` uses the same sequence (without the relaunch).
- [x] Target is `/Applications/Inmemnote.app` — the documented install
  location, where the launcher and Dock already point. The helper takes the
  install directory as an optional `$3` (default `/Applications`) and
  `install.sh` honours `INMEMNOTE_INSTALL_DIR`, purely so the unit tests can
  run both scripts against a temp directory with fake `hdiutil`/`open`/
  `xattr`/`curl` (`src/test/shellSandbox.ts`). The sandbox refuses to run a
  script that mentions `/Applications` anywhere but that default.
- [ ] **Open: DMG integrity check.** The downloaded DMG is not verified. The
  proposal is for CI to publish `Inmemnote-macos-arm64.dmg.sha256` next to
  the DMG and for the updater (and `install.sh`) to compare it before
  mounting. Needs a CI change; waiting on a decision.

### 4d.4 UI
- [x] `UpdateBanner` (Library window, under the toolbar): one line, hidden
  until a release is found. "Update & restart" / "Later" (dismiss;
  re-surfaces next check) / "What's new" link. Shows a progress bar while
  downloading and a failure message on error (retry stays available).
- [x] i18n keys under `update.*` in both locales.

### 4d.5 Architecture
- [x] Domain: `AppVersion` (VO with numeric semver compare), `ReleaseInfo`,
  ports `ReleaseGateway` + `UpdateInstaller`, `errors.ts`.
- [x] Application: `CheckForUpdateUseCase`, `InstallUpdateUseCase`
  (both return `Result`).
- [x] Infrastructure: `GithubReleaseGateway`, `DmgSelfUpdater` (injectable
  seams for unit tests), `main/ipc/update.ts`.
- [x] IPC: `update:check` / `update:install` (invoke) + `update:available` /
  `update:progress` (broadcast). Preload `window.inmemnote.update.*`.
- [x] Presentation: `presentation/update/` slice + `UpdateBanner`.
- [x] Auto-check + timers are disabled under `INMEMNOTE_E2E=1` and the
  gateway is stubbed to fail-soft, so the E2E suite stays hermetic/offline.
- [x] 44 unit tests across the layers.

> **Closed item (2026-10-22).** The dead `update-electron-app` dependency
> (we don't use Squirrel) was removed in a dedicated dependency commit
> (`npm uninstall` + committed lockfile); no source file imported it.

> **E2E note.** No Playwright spec is added for the install flow: it is
> network- + process-replacement-bound (it quits and swaps the running app)
> and is deliberately disabled under E2E. Banner rendering and the
> check/install state machine are covered by component + slice unit tests.

---

## 5. Decision log

- **2026-06-05** — Stack confirmed: Electron Forge + Vite, Redux Toolkit,
  CodeMirror 6, Vitest + Playwright. Accent `#3f7d6b`.
- **2026-06-05** — Source-file comments are written in English (the
  language of the code); Markdown documentation was initially Russian.
- **2026-06-05** — V1 Draft closed: domain + application + infrastructure
  (SQLite + Electron main/preload/IPC + global hotkey) + presentation
  (React + Redux Toolkit + CodeMirror 6 + Tailwind). 23 unit tests
  green, `tsc --noEmit` and `eslint` clean.
- **2026-06-05** — V1.1 closed: custom CM6 decorators (marker hiding on
  inactive lines, blockquote with accent stripe), Tab/Shift+Tab for
  list nesting, dynamic window resize via ResizeObserver + IPC,
  corner positioning for pin (`top-right`, 24 px), and 360 ms FLIP
  morph on pin/unpin via the Web Animations API.
- **2026-06-05** — V3 (multiple stickers) and V4 (Markdown import/export)
  dropped from the roadmap. V5 (auto-update) deferred.
- **2026-06-05** — V2 (Library) closed. Main window with 3-pane layout,
  Dock visible, two BrowserWindows in one renderer bundle via `?view=`.
  Domain Note + NoteRepository (Sqlite/InMemory), 8 use-cases with
  tests. Library Redux slice with async thunks and a locally-patched
  editor. Draft⌘↵ → PromoteDraftToNoteUseCase + `notes:changed`
  broadcast. Tags deferred per the customer. 47/47 unit tests green.
- **2026-06-06** — All Markdown docs (README, CLAUDE.md, docs/TZ.md,
  docs/HOTKEYS.md) translated to English. New top-level docs default to
  English now.
- **2026-06-09** — V2.1 (Settings) closed. Modal popup in the Library
  window, key-value `settings` SQLite table, theme + per-token color
  picker palette, global hotkey configurable from the UI. Database row
  takes precedence over YAML hotkey config so the popup is the
  documented user workflow. Mattermost-style JSON import deferred —
  the storage layer already serializes through JSON, so dropping it in
  later is a UI-only change.
- **2026-06-09** — V2.2 (i18n) closed. Tiny home-grown layer instead of
  react-i18next (one hook + two dictionaries, ~50 keys). Decision drivers:
  no new runtime dep, TS-enforced full coverage of the message catalog,
  trivial review surface. Plural rules and ICU formatting are
  deliberately out of scope — when we need them, we add the library.
- **2026-07-01** — V2.3 (Auto-update) closed. Chose a signing-free
  self-updater over `update-electron-app`/Squirrel.Mac: Squirrel requires a
  valid Apple Developer ID signature, which the project deliberately doesn't
  have (ad-hoc-signed, `curl`-installed to dodge quarantine). The updater
  reads the existing GitHub Releases feed and reproduces `install.sh` from a
  detached helper (wait-for-PID → mount → swap `/Applications` bundle →
  de-quarantine → relaunch), so it works today at zero cost and keeps the
  "no backend" promise. `update-electron-app` is now dead code, flagged for
  removal in a follow-up dependency commit. Full alternatives considered:
  Apple Developer ID + notarization + Squirrel (rejected: $99/yr + cert
  management), notify-only banner (rejected: still manual install). See §4d.
- **2026-10-22** — Tooling hygiene. Dropped the dead `update-electron-app`
  dependency (closes the §4d open item). Node is pinned via `.nvmrc` = 22
  (CI reads it with `node-version-file`, so local and CI agree) and
  `engines.node >=22` — a floor, not an exact pin, because newer Node
  versions are known to work for tsc/ESLint/Vitest. Added the missing
  `.husky/pre-commit` (lint-staged + `npm run typecheck`), which CLAUDE.md
  §9 had promised but never ran.
- **2026-10-22** — Documentation re-synced with the v0.6.0 code:
  `docs/ARCHITECTURE.md` now lists every context (Draft/Pin, Note/Library,
  Settings, Update, i18n), all six ports and both windows;
  `.agents/playwright/test-plan.md` maps critical flows to the 12 e2e specs;
  `CLAUDE.md` §3 tree, README and `docs/HOTKEYS.md` updated. ADRs recorded
  retroactively: 0002 (signing-free self-updater), 0003 (two windows, one
  renderer bundle).
- **2026-10-22** — Persistence refactor: single SQLite connection +
  versioned migrations (ADR 0004). The three repositories used to open
  their own connections and run inline `CREATE TABLE IF NOT EXISTS`, with
  no schema version — any future schema change was unsafe for existing
  files. Now `openDatabase` (WAL + `runMigrations`) is called once from the
  composition root and the connection is passed into each repository.
  Migrations are append-only, each applied in its own `IMMEDIATE`
  transaction together with the `user_version` bump; a file from a newer
  app version is refused (in-memory fallback, file untouched). Migration 1
  reuses the v0.6.0 DDL verbatim with `IF NOT EXISTS`, which is what makes
  the adoption of existing user files lossless — covered by a spec that
  seeds a v0.6.0-shaped file. A failed open now degrades all three stores
  together; per-repository try/catch is kept.
- **2026-10-22** — IPC contracts moved out of infrastructure (ADR 0005).
  Chose `src/shared/ipc/` over a new `src/contracts/` layer (same effect,
  no new alias or §3 layer) and over `application` (channel names and the
  window API are transport, not use-case contracts). Zod schemas stay
  main-side — the trust boundary is main, and keeping `shared` dependency-
  free means neither preload nor the renderer bundle Zod; the cost is that
  schemas `satisfies` the shared DTOs rather than being their source.
- **2026-10-22** — Electron 33 → 45 and toolchain upgrade, done in two
  commits so a regression can be pinned to either the runtime or the build:
  (1) Electron 45 + better-sqlite3 13 on Forge 7, (2) Forge 8 + Vite 8 +
  Vitest 5 + fuses 2. Decisions and consequences:
  - **macOS 13 Ventura is the new floor** (Electron 38 dropped macOS 11,
    Electron 44 dropped macOS 12). Accepted by the user.
  - **No more Electron-ABI rebuilds.** better-sqlite3 13 is N-API with
    bundled prebuilds (no `bindings` dep any more), and `window-events` was
    already N-API — so the `@electron/rebuild` / `npm rebuild` steps are gone
    from CI. Packaging copies only the target's better-sqlite3 prebuild.
  - **Electron 42+ downloads its binary lazily**; CI runs
    `npx install-electron --no` so the binary is cached and shipped in the
    e2e tarball.
  - **Forge 8**: main/preload bundles are `.cjs`
    (`package.json#main` = `.vite/build/main.cjs`); packager hooks take one
    object; `.node` files are asar-unpacked by default (auto-unpack-natives
    plugin dropped); `npm run publish` → `npm run release`; DMGs land in
    `out/make/dmg/<arch>/`.
  - **Vitest 4+** only `new`s mocks with a `function` implementation —
    constructor doubles were updated accordingly.
  - **CSP** added; production forbids inline scripts and `eval`, inline
    styles stay allowed for CodeMirror/React `style` props.
- **2026-10-22** — Release policy aligned with SuperLaunchpad (ADR 0006).
  The DMG from the Releases page is the primary install channel (first launch
  via Open Anyway), Homebrew (`dantesChmo/tap/inmemnote`) the second, the
  `curl` installer an alternative. The DMG build moved from `ci.yml`'s
  `build` job to `release.yml`, which calls `ci.yml` as its test gate, takes
  the version from the tag, marks `-suffix` tags as prereleases, and signs +
  notarizes when the Apple secrets exist (never exercised yet). Every release
  still carries the stable `Inmemnote-macos-arm64.dmg`, because installed
  updaters and `install.sh` fetch that exact name.
- **2026-10-22** — Use-case fakes moved out of infrastructure (ADR 0007),
  closing the open question from ADR 0005. The `InMemory*Repository` classes
  stay in `infrastructure/persistence/` because they are the production
  fallback (bug #03); use-case specs now use dedicated `Fake*Repository` and
  `FixedClock` in `src/test/fakes/` (alias `@test`, present only in
  `tsconfig.json`/`vitest.config.ts`, so production cannot bundle it). The
  boundary lint lost its `src/application/**/*.spec.ts` exemption and gained
  two guards: production code never imports `src/test`, and `src/test`
  imports only domain/shared. Rejected: moving the adapters into `src/test`
  (production would import test code) or into `domain/__fakes__` (adapters in
  the domain layer), and a `src/test` barrel re-exporting infrastructure
  (launders the edge). Cost: the in-memory ordering logic now exists twice —
  the fake must be kept in step with the adapter by hand.
- **2026-10-22** — Ownership gap closed in `.agents/RESPONSIBILITIES.md`:
  `src/domain/**`, `src/infrastructure/SystemClock.ts`, `src/shared/**`
  (except `ipc/`) and `scripts/**` → `nodejs-backend-developer` (domain shape
  changes designed by `architector` first); `src/shared/ipc/**` co-owned
  with `react-electron-developer`, like `docs/IPC.md`;
  `scripts/gen-test-plan.mjs` → `playwright-specialist`; `src/test/**` →
  `test-specialist`. Agent prompts synced (the renderer prompt still listed
  the deleted `ipc-channels.ts`).
