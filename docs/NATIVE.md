# Native addons

> Owned by the `objc-developer` agent. Anything touching `.m` / `.mm` /
> N-API code is referenced here.

## Addons in this repo

| Name | Purpose | Source | JS surface | Notes |
|---|---|---|---|---|
| `@inmemnote/window-events` | macOS window / focus event hooks for the global hotkey overlay | _(path tbd)_ | _(tbd)_ | local workspace package |

## Build & rebuild

- The addon must be built against the **bundled Node ABI shipped with the
  Electron version pinned in `package.json`** — not the system Node.
- After installing or upgrading Electron, rebuild with the project's
  configured electron-rebuild step (typically `npm run rebuild` or via
  Electron Forge).
- `npm ci` is the default install mode (CLAUDE.md §9). `npm install` is
  reserved for adding/removing deps in one explicit commit.

## Memory & threading rules

- ARC on. All blocks that capture `self` use `__weak typeof(self) weakSelf`.
- AppKit calls happen on the main thread. Native callbacks that originate
  on a background thread hop with `dispatch_async(dispatch_get_main_queue(), ^{ ... })`.
- Errors in native code are converted to JS exceptions at the N-API
  boundary — never to `abort()` or a crash.

## Signing & notarization

- Native code is part of the signed bundle. Any new framework or library
  added to the addon needs to be checked against the hardened runtime
  entitlements before shipping.

## Known macOS-version quirks

- _(none recorded yet)_
