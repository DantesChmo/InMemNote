# Contributing to Inmemnote

Everything you need to build, run and test Inmemnote from source, and the
conventions the codebase follows. For what the app does and how to install
it, see the [README](README.md).

Before changing code, read:

1. [`CLAUDE.md`](CLAUDE.md) — the project constitution: stack, layering
   rules, principles, workflow.
2. [`docs/TZ.md`](docs/TZ.md) — work state and decision log.
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the current
   module-level picture; reasoning behind non-obvious choices lives in
   [`docs/adr/`](docs/adr/).

## Build from source

Requires Node.js 22+ (Node 25 also works) and npm 10+. CI runs the
version in `.nvmrc` (22); `nvm use` picks it up locally.

```sh
git clone https://github.com/DantesChmo/InMemNote.git
cd InMemNote
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

No rebuild against the Electron ABI is needed: both native addons
(`better-sqlite3`, which ships prebuilt binaries, and
`@inmemnote/window-events`, compiled by `npm ci`) are N-API and load in
Node and Electron alike. Compiling `window-events` needs Xcode or the
Command Line Tools (`swift`).

The Electron binary itself is no longer fetched during install (Electron
42+): it downloads on the first `require('electron')` / `npx electron`.
To fetch it up front — e.g. before going offline — run
`npx install-electron --no`.

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

Releases are built by CI from a `v*` tag; see
[docs/RELEASING.md](docs/RELEASING.md).

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

## Workflow

- Pick a task from `docs/TZ.md`, mark it `[~]` while in progress and `[x]`
  with a short note on the decisions made when done. Open questions go into
  its "Open questions" block.
- Work through the TDD pipeline: interfaces and signatures → red tests →
  implementation → refactor. Commit in small steps.
- The pre-commit hook (husky + lint-staged) runs ESLint and Prettier on
  staged files, then type-checks the whole project.
- Releases are built by CI from a `v*` tag — see
  [docs/RELEASING.md](docs/RELEASING.md).

## Further reading

| Doc | What's in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Bounded contexts, ports, adapters, windows |
| [docs/IPC.md](docs/IPC.md) | Every main ↔ renderer channel and its contract |
| [docs/NATIVE.md](docs/NATIVE.md) | The `@inmemnote/window-events` native addon |
| [docs/TESTING.md](docs/TESTING.md) | Testing conventions |
| [docs/HOTKEYS.md](docs/HOTKEYS.md) | Hotkey config, defaults and overrides |
| [docs/RELEASING.md](docs/RELEASING.md) | Signing modes, release CI, Homebrew tap |
