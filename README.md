# Inmemnote

[![CI](https://github.com/DantesChmo/InMemNote/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/DantesChmo/InMemNote/actions/workflows/ci.yml)
[![Release](https://github.com/DantesChmo/InMemNote/actions/workflows/release.yml/badge.svg)](https://github.com/DantesChmo/InMemNote/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/DantesChmo/InMemNote?sort=semver)](https://github.com/DantesChmo/InMemNote/releases/latest)
[![Release date](https://img.shields.io/github/release-date/DantesChmo/InMemNote)](https://github.com/DantesChmo/InMemNote/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/DantesChmo/InMemNote/total)](https://github.com/DantesChmo/InMemNote/releases)

[![macOS 13+](https://img.shields.io/badge/macOS-13%2B-000000?logo=apple&logoColor=white)](#install-on-macos)
[![Apple Silicon](https://img.shields.io/badge/Apple_Silicon-arm64-000000?logo=apple&logoColor=white)](#install-on-macos)
[![Local only](https://img.shields.io/badge/storage-local_only-3f7d6b)](#storage)
[![Electron](https://img.shields.io/github/package-json/dependency-version/DantesChmo/InMemNote/dev/electron?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/github/package-json/dependency-version/DantesChmo/InMemNote/react?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/github/package-json/dependency-version/DantesChmo/InMemNote/dev/typescript?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/github/package-json/dependency-version/DantesChmo/InMemNote/dev/vite?logo=vite&logoColor=white)](https://vite.dev/)
[![CodeMirror](https://img.shields.io/github/package-json/dependency-version/DantesChmo/InMemNote/codemirror)](https://codemirror.net/)
[![SQLite](https://img.shields.io/github/package-json/dependency-version/DantesChmo/InMemNote/better-sqlite3?logo=sqlite&logoColor=white&label=better-sqlite3)](https://github.com/WiseLibs/better-sqlite3)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](CONTRIBUTING.md)

[![Last commit](https://img.shields.io/github/last-commit/DantesChmo/InMemNote)](https://github.com/DantesChmo/InMemNote/commits/main)
[![Commit activity](https://img.shields.io/github/commit-activity/m/DantesChmo/InMemNote)](https://github.com/DantesChmo/InMemNote/graphs/commit-activity)
[![Top language](https://img.shields.io/github/languages/top/DantesChmo/InMemNote)](https://github.com/DantesChmo/InMemNote)
[![Code size](https://img.shields.io/github/languages/code-size/DantesChmo/InMemNote)](https://github.com/DantesChmo/InMemNote)
[![Open issues](https://img.shields.io/github/issues/DantesChmo/InMemNote)](https://github.com/DantesChmo/InMemNote/issues)
[![Stars](https://img.shields.io/github/stars/DantesChmo/InMemNote)](https://github.com/DantesChmo/InMemNote/stargazers)

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

Apple Silicon only, macOS 13 Ventura or later (the floor set by Electron 44+).

### DMG

Download the latest `Inmemnote-X.Y.Z-arm64.dmg` from the
[Releases](https://github.com/DantesChmo/InMemNote/releases/latest) page,
open it and drag **Inmemnote** into `Applications`.

### Homebrew

```sh
brew install --cask dantesChmo/tap/inmemnote
```

The app updates itself (see [Auto-update](#auto-update)), so `brew upgrade`
skips it unless you pass `--greedy`.

### First launch: allowing the app

Inmemnote is not notarized by Apple, so macOS blocks it the first time you
open it, whether it came from the DMG or Homebrew. Allow it once:

1. Open **Inmemnote**. When macOS says it can't verify the developer, click
   **Done**.
2. Open **System Settings → Privacy & Security** and scroll down to the
   **Security** section.
3. Next to the message about Inmemnote, click **Open Anyway**, then confirm
   with your password or Touch ID.

After that it opens normally, and later versions installed by the built-in
updater open without asking again. (Right-click → **Open** no longer bypasses
this on macOS 15 Sequoia and later.)

### Alternative: one-line installer

To skip the Open Anyway step, install from the terminal instead. This
downloads the latest DMG, copies the app to `/Applications` and launches it:

```sh
curl -fsSL https://raw.githubusercontent.com/DantesChmo/InMemNote/main/scripts/install.sh | bash
```

A browser (and Homebrew) stamps downloads with a `com.apple.quarantine` flag,
which is what makes Gatekeeper block an app that isn't notarized. `curl`
doesn't set that flag, so the app opens on a normal double-click.

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
ID: it reproduces the `curl` install flow from inside the app, so updated
versions never hit the Gatekeeper prompt, however the first copy was
installed. Everything runs against the
public GitHub release — no backend of our own.

## Out of scope

- Cloud sync / backend.
- Accounts, auth, telemetry.
- Multiple concurrent pinned stickers.
- Markdown file import/export.

---

## Contributing

Building from source, running tests, architecture and code conventions are
covered in [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

Internal project, license not defined.
