# ADR 0003 — Two windows in one renderer bundle, routed by `?view=`

- **Status**: Accepted
- **Date**: 2026-06-05 (V2; recorded retroactively on 2026-10-22)
- **Related**: `docs/TZ.md` §4a.8 and decision log §5;
  `docs/ARCHITECTURE.md` → Windows

## Context

V2 added the Library as a second top-level window beside the Draft overlay.
The two windows have very different chrome: Draft is a frameless, Dock-less
overlay that hides on blur; Library is a normal Dock window with a
`hiddenInset` title bar. Their UIs share a lot, though: the CodeMirror 6
editor and its Markdown extensions, design tokens, the i18n catalog, the
Settings slice that applies theme and palette, and the
`window.inmemnote` preload API.

Electron Forge's Vite template builds one renderer entry and one preload
per configuration. A second window could get either its own renderer entry
(a second Vite renderer config, possibly a second preload), or reuse the
existing one.

## Decision

Both windows load the **same renderer bundle and the same preload**. Main
tells them apart with a query parameter:

- `src/infrastructure/electron/main/renderer.ts` loads the entry with
  `?view=draft` or `?view=library`. In development it appends the query to
  the Vite dev-server URL; in production it uses
  `loadFile(path, { query: { view } })`, because some Electron versions drop
  the query string from a hand-built `file://` URL, which once made the
  Draft window silently render the Library.
- `src/presentation/app/App.tsx` reads `?view=` once and mounts
  `DraftPanel` or `LibraryWindow`. Anything else falls back to Library, the
  surface a user reaches from the Dock.
- Window-specific behaviour (frame, blur, pin, size) lives in main, in
  `DraftWindowController` and `LibraryWindowController`. The renderer only
  decides which React tree to mount.
- Each window runs its own instance of the same Redux store definition.
  State that must be shared crosses through main as broadcasts
  (`notes:changed`, `settings:changed`, `update:*`), never through renderer
  memory.

## Consequences

- One Vite renderer config, one preload, one place for styles and tokens.
  The Library editor reuses the Draft `CodeMirrorEditor` as is.
- Each window downloads and parses code it never renders (for example, the
  Draft overlay ships the Library and Settings components). Acceptable for
  a local app loading from disk.
- Both windows expose the full `window.inmemnote` API, including namespaces
  that window doesn't use. The preload surface can't be narrowed per
  window without splitting the preload.
- Cross-window consistency depends on main remembering to broadcast after
  each mutation. A missing broadcast shows up as a stale window, not as an
  error.
- Adding a third surface means a new `view` value, a branch in `App.tsx`
  and a window controller in main. If surfaces start to diverge in
  dependencies or security needs, split the bundle with a new ADR that
  supersedes this one.
