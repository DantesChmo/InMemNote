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
- [ ] **Later — Auto-update.** Wire up `update-electron-app` (requires a
  GitHub Releases feed + macOS code signing/notarization).

---

## 1. Project infrastructure

- [x] `CLAUDE.md` — constitution, stack, rules.
- [x] `docs/TZ.md` — this file.
- [x] `docs/HOTKEYS.md` — hotkey config format.
- [x] Electron Forge + Vite + TS + React initialized.
- [x] Tailwind CSS + design tokens for the palette
  (`src/presentation/theme/tokens.css`).
- [x] ESLint + Prettier + EditorConfig + husky/lint-staged.
- [x] Vitest + RTL.
- [x] Playwright (electron) — config in place, smoke test in V2.
- [x] DDD directory structure (domain/application/infrastructure/presentation).

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
- [x] `⌘↵` saves and hides; `Esc` cancels with autosave.
- [x] `Tab` / `Shift+Tab` nest lists via `indentMore`/`indentLess`.

### 2.5 Persistence
- [x] Debounced autosave (500 ms after the last keystroke).
- [x] Storage: SQLite (`better-sqlite3`), path `userData/inmemnote.db`.
- [x] Schema: `drafts(id TEXT PK, content TEXT, pinned INT, created_at,
  updated_at)` with an index on `updated_at DESC`.
- [x] Falls back to an in-memory repository if SQLite init fails.

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
- [x] Auto-save 500 ms after the last keystroke.
- [x] `⌘↵` in the Library editor — synchronous flush, no promote.
- [x] Delete button — `deleteNote`; selection moves to the next note.

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
