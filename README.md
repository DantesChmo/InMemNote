# Inmemnote

A local quick-notes app for macOS. Two surfaces:

- **Draft** — a Spotlight-style overlay summoned by a global hotkey
  (default `⌘⇧Space`). Floats over any app, frameless, no Dock icon.
  `⌘↵` promotes the buffer into the Library, `Esc` keeps it in the scratch
  slot, the pin button keeps the overlay on top of every other window.
  Hidden from screen-capture (Zoom, Meet, QuickTime) via macOS
  `NSWindowSharingNone` — you see the overlay, your audience doesn't.
- **Library** — the main app window. Opens from Launchpad / Dock. Three
  panes: sidebar (All / Pinned), card list with search, Markdown editor.

No cloud, no backend. Everything lives in a local SQLite file
(`better-sqlite3`).

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

---

## Architecture — DDD

```
src/
├── domain/            # pure TS. No imports from react/electron/sqlite.
│   ├── draft/         # DraftNote (the scratch buffer) + ports
│   ├── note/          # Note (library item) + ports
│   └── shared/        # Clock, DomainError
│
├── application/       # use-cases. Depend on domain, ignorant of frameworks.
│   ├── draft/         # Open / Save / TogglePin / Close
│   └── note/          # List / Find / Create / Update / TogglePin /
│                      # Delete / Search / PromoteDraftToNote
│
├── infrastructure/    # port implementations: SQLite, IPC, Electron adapters.
│   ├── persistence/   # InMemory* and SqliteDraftRepository / SqliteNoteRepository
│   ├── electron/      # main process, preload (contextBridge), IPC channels
│   ├── config/        # zod-validated config loaders
│   └── SystemClock.ts # SystemClock / FixedClock
│
├── presentation/      # React + Redux + CodeMirror 6.
│   ├── draft/         # Draft panel, header, footer, editor
│   ├── library/       # Library window, sidebar, list, editor, slice
│   ├── theme/         # design tokens
│   └── app/           # composition root + Redux store + ?view= routing
│
└── shared/            # Result<T, E> and other truly cross-cutting bits.
```

Dependency rule:
`presentation → application → domain`
`infrastructure → application/domain (only port implementations)`
`domain` depends on nothing.

---

## Development principles

- **SOLID, DRY, DDD, TDD.**
- Every feature ships through the **interfaces → tests → implementation**
  pipeline.
- Use-cases return `Result<T, DomainError>` — no `throw` across layers.
- Source comments are written **in English**; only Markdown documentation is
  in Russian.
- Comment style: written by a Senior, read by a Junior. Explain *why*, never
  restate *what* the code already says.

Details live in `CLAUDE.md` (the project constitution) and `docs/TZ.md`
(work state + decision log) — both in Russian.

---

## Install

Requires Node.js 22+ (Node 25 also works) and npm 10+.

```sh
git clone <repo>
cd inmemnote
npm install
```

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

Cover domain aggregates, value objects, application use-cases, and
presentation helpers. **47 tests, ~1.3s.**

### E2E (Playwright + Electron)

```sh
npm run e2e:prepare   # required before the first E2E run
npm run e2e           # all specs
npx playwright test e2e/library/crud.spec.ts -g "starts empty"  # one test
```

The suite has **17 scenarios**:

- **Library CRUD** — empty start, `⌘N` create, edit, delete, switching
  between notes, persistence across app restarts.
- **Library search / filters** — `⌘F` focus, live search, highlight, `Esc`
  clears, Pinned filter.
- **Library pin** — toggle, marker on the card, pinned notes rise to the top.
- **Draft lifecycle** — summon, `Esc` keeps the scratch buffer, autosave
  survives re-summon, blur hides an unpinned overlay, pin keeps it on top.
- **Draft → Library promote** — `⌘↵` creates a Note and clears the scratch;
  an empty draft creates nothing.
- **Visual smoke** — tokens resolve, Tailwind utilities ship in the bundle,
  React mounted content; screenshots are saved under `test-results/`.

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
| Save + close         | `⌘↵`                 | Draft    |
| Hide without promote | `Esc`                | Draft    |
| Pin                  | header button        | Draft    |
| New note             | `⌘N`                 | Library  |
| Focus search         | `⌘F`                 | Library  |
| Clear search         | `Esc` in search box  | Library  |

The global hotkey can be overridden via
`~/Library/Application Support/Inmemnote/hotkeys.yaml`.
See `docs/HOTKEYS.md`.

---

## Storage

- File: `<userData>/inmemnote.db` (on macOS that's
  `~/Library/Application Support/Inmemnote/inmemnote.db`).
- Tables:
  - `drafts` — a single active scratch buffer; overwritten by a 500ms
    debounced autosave.
  - `notes` — every promoted library item.
- If SQLite fails to initialize, the app falls back to an in-memory
  repository (notes survive the session but not a restart).

---

## Out of scope

- Cloud sync / backend.
- Accounts, auth, telemetry.
- Multiple concurrent pinned stickers.
- Markdown file import/export.

Auto-update (`update-electron-app`) is on the roadmap but requires macOS
code signing and notarization — deferred.

---

## License

Internal project, license not defined.
