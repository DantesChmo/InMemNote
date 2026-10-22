# Inmemnote

A local quick-notes app for macOS. Two windows:

- **Draft** — a Spotlight-style overlay summoned by a global hotkey
  (default `⌘⇧Space`). Floats over any app, frameless, no Dock icon.
  `⌘↵` promotes the buffer into the Library, `Esc` keeps it in the scratch
  slot, the pin button keeps the overlay on top of every other window.
  Hidden from screen-capture (Zoom, Meet, QuickTime) via macOS
  `NSWindowSharingNone` — you see the overlay, your audience doesn't.
- **Library** — the main app window. Opens from Launchpad / Dock. Three
  panes: sidebar (All / Pinned), card list with search, Markdown editor.
  The gear icon opens **Settings** (theme, palette, global hotkey, language
  — English / Russian).

No cloud, no backend. Everything lives in a local SQLite file
(`better-sqlite3`).

---

## Install on macOS

Apple Silicon only. One command downloads the latest release, installs it to
`/Applications` and launches it:

```sh
curl -fsSL https://raw.githubusercontent.com/DantesChmo/InMemNote/main/scripts/install.sh | bash
```

**Why `curl` and not the browser.** A browser stamps every download with a
`com.apple.quarantine` flag. Because the app isn't notarized by an Apple
Developer ID, that flag makes Gatekeeper block the first launch — you'd have
to approve it in *System Settings → Privacy & Security*. `curl` (like `git`
or a USB copy) doesn't set the flag, so the app opens on a normal
double-click, no prompts. Only the first install is manual; the built-in
auto-updater (below) handles later versions the same quarantine-free way.

**Prefer to do it by hand?** Grab `Inmemnote-macos-arm64.dmg` from the
[latest release](https://github.com/DantesChmo/InMemNote/releases/latest),
open it, drag **Inmemnote** into Applications, then run once:

```sh
xattr -dr com.apple.quarantine /Applications/Inmemnote.app
```

That `xattr` line is only needed when the DMG came from a browser — it strips
the quarantine flag so the app launches without the Gatekeeper prompt.

---

## Stack

| Layer              | Tech                                          |
|--------------------|-----------------------------------------------|
| Language           | TypeScript (strict)                           |
| Runtime            | Electron + Node.js                            |
| Bundler            | Electron Forge with the Vite template         |
| UI                 | React 18                                      |
| Styling            | Tailwind CSS + CSS custom properties          |
| State              | Redux Toolkit                                 |
| Markdown editor    | CodeMirror 6                                  |
| Storage            | SQLite (`better-sqlite3`)                     |
| Config validation  | Zod                                           |
| Unit tests         | Vitest + React Testing Library                |
| E2E                | Playwright (Electron driver)                  |
| Linter             | ESLint (typescript-eslint + react-hooks)      |
| Formatter          | Prettier                                      |
| Pre-commit         | husky + lint-staged                           |
| Auto-update        | In-house signing-free updater (GitHub Releases) |

---

## Architecture — DDD

```
src/
├── domain/            # pure TS. No imports from react/electron/sqlite.
│   ├── draft/         # DraftNote (the scratch buffer) + DraftRepository
│   ├── note/          # Note (library item) + NoteRepository
│   ├── settings/      # AppSettings, Hotkey, ThemeMode, PaletteOverrides,
│   │                  # LanguageMode + SettingsRepository
│   ├── update/        # AppVersion, ReleaseInfo + ReleaseGateway / UpdateInstaller
│   └── shared/        # Clock, DomainError
│
├── application/       # use-cases. Depend on domain, ignorant of frameworks.
│   ├── draft/         # Open / Save / TogglePin / Close
│   ├── note/          # List / Find / Create / Update / TogglePin /
│   │                  # Delete / Search / PromoteDraftToNote
│   ├── settings/      # LoadSettings / UpdateSettings
│   └── update/        # CheckForUpdate / InstallUpdate
│
├── infrastructure/    # port implementations: SQLite, IPC, Electron adapters.
│   ├── persistence/   # InMemory* and Sqlite* repositories (drafts, notes, settings)
│   ├── electron/      # main process, preload (contextBridge), IPC channels
│   ├── update/        # GitHub Releases gateway + DMG self-updater
│   ├── config/        # zod-validated config loaders
│   └── SystemClock.ts # SystemClock / FixedClock
│
├── presentation/      # React + Redux + CodeMirror 6.
│   ├── draft/         # Draft panel, header, footer, editor
│   ├── library/       # Library window, sidebar, list, editor, slice
│   ├── settings/      # Settings popup, palette editor, hotkey input
│   ├── update/        # update banner
│   ├── i18n/          # typed message catalog, en / ru
│   ├── theme/         # design tokens
│   └── app/           # composition root + Redux store + ?view= routing
│
└── shared/            # Result<T, E>.
```

Dependency rule:
`presentation → application → domain`
`infrastructure → application/domain (only port implementations)`
`domain` depends on nothing.

The current module-level picture (contexts, ports, adapters, windows) is in
`docs/ARCHITECTURE.md`; the reasoning behind non-obvious choices is in
`docs/adr/`.

---

## Development principles

- **SOLID, DRY, DDD, TDD.**
- Every feature ships through the **interfaces → tests → implementation**
  pipeline.
- Use-cases return `Result<T, DomainError>` — no `throw` across layers.
- Source comments and Markdown documentation are written **in English**.
- Comment style: written by a Senior, read by a Junior. Explain *why*, never
  restate *what* the code already says.

Details live in `CLAUDE.md` (the project constitution) and `docs/TZ.md`
(work state + decision log).

---

## Build from source

Requires Node.js 22+ (Node 25 also works) and npm 10+. CI runs the
version in `.nvmrc` (22); `nvm use` picks it up locally.

```sh
git clone <repo>
cd inmemnote
npm ci
```

**Always use `npm ci`, not `npm install`.** `npm ci` wipes
`node_modules` and installs exactly what `package-lock.json` declares —
the only way to guarantee a reproducible tree. `npm install` may mutate
the lockfile or leave partial state behind, which is the most common
source of "works on my machine" bugs (missing `react`/`electron` type
declarations, mismatched native ABI, etc.). Only reach for `npm install`
when you are deliberately adding or removing a dependency; commit the
updated lockfile in the same change.

After install, rebuild the native module against the Electron ABI
(do this once, and again after every Electron upgrade):

```sh
npx @electron/rebuild -f -w better-sqlite3
```

---

## Run

### Development (Vite HMR)

```sh
npm start
```

Library opens; summon Draft with the global hotkey (`⌘⇧Space`).

### Production build

```sh
npm run e2e:prepare   # forges .vite/ + out/Inmemnote-darwin-arm64/Inmemnote.app
open out/Inmemnote-darwin-arm64/Inmemnote.app
```

For a distributable (DMG/ZIP):

```sh
npm run make
```

---

## Tests

### Unit (Vitest + RTL)

```sh
npm test           # single run
npm run test:watch # watch mode
```

Cover domain aggregates and value objects, application use-cases, the
SQLite / in-memory repositories, the Electron main process (IPC handlers,
window controllers, hotkey), and presentation components and slices. Specs
live next to the code they cover (`Foo.ts` ↔ `Foo.spec.ts`).

### E2E (Playwright + Electron)

```sh
npm run e2e:prepare   # required before the first E2E run
npm run e2e           # all specs
npx playwright test e2e/library/crud.spec.ts -g "starts empty"  # one test
```

The suite has **75 scenarios in 12 spec files**:

- **Draft lifecycle** (`e2e/draft/lifecycle.spec.ts`) — summon, `Esc` keeps
  the scratch buffer, autosave survives re-summon and restart, blur hides an
  unpinned overlay, pin keeps it on top, toggle races, positioning.
- **Draft rendering** (`e2e/draft/markdown-render.spec.ts`,
  `list-quote-render.spec.ts`) — headings, inline styles, bullets, quotes.
- **Pin** (`e2e/draft/pin-*.spec.ts`, `content-protection.spec.ts`) — window
  geometry, always-on-top, drag-to-corner, manual resize, screen-capture
  protection.
- **Library** (`e2e/library/crud.spec.ts`, `pin.spec.ts`,
  `search-filter.spec.ts`) — CRUD, restart persistence, pin ordering,
  `⌘F` live search, highlight, `Esc` reset, Pinned filter.
- **Draft → Library promote** (`e2e/cross-window/draft-promote.spec.ts`) —
  `⌘↵` creates a Note and clears the scratch; an empty draft creates nothing.
- **Visual smoke** (`e2e/visual-smoke.spec.ts`) — tokens resolve, Tailwind
  utilities ship in the bundle, React mounted content.

The full scenario list (steps, expected results, priority) is generated from
the specs' JSDoc into `e2e/TEST-PLAN.md`:

```sh
npm run gen:test-plan    # regenerate after editing a spec
npm run check:test-plan  # what CI runs — fails if the file is stale
```

Every test launches with a fresh tmp `userData`, so they never pollute the
local store.

### Misc

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint, zero warnings expected
npm run lint:fix    # auto-fix
npm run format      # prettier --write
```

---

## Keyboard shortcuts

| Action               | Shortcut             | Scope    |
|----------------------|----------------------|----------|
| Open Draft           | `⌘⇧Space`            | global   |
| Promote to Library   | `⌘↵`                 | Draft    |
| Hide without promote | `Esc`                | Draft    |
| Pin                  | header button        | Draft    |
| New note             | `⌘N`                 | Library  |
| Focus search         | `⌘F`                 | Library  |
| Clear search         | `Esc` in search box  | Library  |
| Save now             | `⌘↵`                 | Library  |

Change the global hotkey in **Settings → Hotkeys**. For scripted setups it
can also be set in `~/Library/Application Support/Inmemnote/hotkeys.yaml`;
a value saved from Settings takes precedence over the YAML file.
See `docs/HOTKEYS.md`.

---

## Storage

- File: `<userData>/inmemnote.db` (on macOS that's
  `~/Library/Application Support/Inmemnote/inmemnote.db`).
- Tables:
  - `drafts` — a single active scratch buffer; overwritten by a 500ms
    debounced autosave.
  - `notes` — every library item (created in Library or promoted from Draft).
  - `settings` — theme, palette, hotkey and language, one JSON value per key.
- If SQLite fails to open or migrate, the stores fall back to in-memory
  repositories (data survives the session but not a restart). This is never
  silent: Library shows a persistent "notes aren't being saved" banner with
  the error reason, and Draft a one-line "Not saved" strip.

---

## Auto-update

The app checks the GitHub Releases feed on launch and every few hours (and
whenever you open the Library). When a newer version is out, a banner appears
at the top of the Library window — **Update & restart** downloads the new DMG
and swaps the app in place, then relaunches. No Squirrel, no Apple Developer
ID: it reproduces the `curl` install flow from inside the app, so updates
stay quarantine-free just like the first install. Everything runs against the
public GitHub release — no backend of our own.

## Out of scope

- Cloud sync / backend.
- Accounts, auth, telemetry.
- Multiple concurrent pinned stickers.
- Markdown file import/export.

---

## License

Internal project, license not defined.
