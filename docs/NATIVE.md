# Native addons

> Owned by the `apple-developer` agent. Anything touching `.m` / `.mm` /
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

## Language policy: Swift first

**Default for all new native code is Swift.** Objective-C and Objective-C++
are fallbacks, used only where Swift is not a viable option.

| Language | Role | When to use |
|---|---|---|
| Swift (`.swift`) | **Default for everything** — business logic, AppKit integration, model types, event handling | New files. New non-trivial code added to existing files (extract to Swift). |
| Objective-C++ (`.mm`) | **N-API shim** — the C-API ↔ Swift bridge | Only as the thin entry point of the addon: parse N-API args, validate, dispatch into Swift, return. Eliminated entirely if `node-swift` is adopted (ADR required). |
| Objective-C (`.m`) | Legacy, single-language ObjC files | Only when patching an existing `.m` file, or hitting an API that genuinely has no Swift interop story (rare — verify). |

A pure-Swift addon via `node-swift` is allowed but requires an ADR — it
removes the ObjC++ shim at the cost of a smaller ecosystem.

**Any new ObjC/ObjC++ code must carry a one-line justification** (comment
or commit message) explaining why Swift was not used.

### Swift specifics

- **ABI**: stable since Swift 5; runtime ships with macOS 10.14.4+, so we
  don't bundle it.
- **Interop**: Swift classes/methods exposed to ObjC++ are marked `@objc`;
  exposed bridging types are reference types or wrapped values.
- **Deployment target**: must match what's declared in `binding.gyp` and
  `package.json`. A bump is a one-line change that ripples — call it out.
- **Bridging header**: `<module>-Bridging-Header.h` brings ObjC types into
  Swift; the Swift-generated header (`<module>-Swift.h`) goes the other way.
- **`@MainActor`**: prefer for AppKit-touching APIs over manual queue hops.

## Memory & threading rules

- **ObjC / ObjC++**: ARC on. All blocks that capture `self` use
  `__weak typeof(self) weakSelf`.
- **Swift**: ARC on. Closures use `[weak self]` / `[unowned self]` to
  break retain cycles. Prefer value types when there's no identity.
- AppKit calls happen on the main thread:
  - ObjC: `dispatch_async(dispatch_get_main_queue(), ^{ ... })`
  - Swift: `DispatchQueue.main.async { ... }` or `@MainActor`
- Errors in native code are converted to JS exceptions at the N-API
  boundary — never to `abort()`, `fatalError`, or an unwrapped `nil` crash.
- **Forbidden at/near the bridge** (Swift): `!`, `try!`, `as!`,
  `fatalError(...)`, `preconditionFailure(...)`.

## Signing & notarization

- Native code is part of the signed bundle. Any new framework or library
  added to the addon needs to be checked against the hardened runtime
  entitlements before shipping.

## Known macOS-version quirks

- _(none recorded yet)_
