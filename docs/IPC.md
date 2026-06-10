# IPC contracts

> Co-owned by `react-electron-developer` (renderer side) and
> `nodejs-backend-developer` (main side). Every cross-process call has a
> row here. Adding or renaming a channel requires updating both sides and
> this document in the same change.

## Rules

- All IPC goes through `preload` via `contextBridge.exposeInMainWorld`. The
  renderer never imports from `electron` directly.
- Channel payloads are **typed**. The TS type lives in a shared file
  accessible to both processes (e.g. `src/infrastructure/electron/ipc/contracts.ts`).
- Inbound payloads from renderer to main are **Zod-validated** at the main-
  side handler before being passed into a use-case.
- Channels are named `<noun>:<verb>` (e.g. `draft:save`, `draft:open`).
- Channels are versioned in name only when an incompatible change ships
  (`draft:save@v2`); never silently change a payload shape.

## Channels

| Channel | Direction | Payload | Response | Owner (main-side) | Notes |
|---|---|---|---|---|---|
| _(none documented yet)_ | | | | | |

## Anti-patterns

- ❌ Renderer reading filesystem or invoking Node APIs.
- ❌ Main-side handler that calls another `BrowserWindow.webContents.send`
  back into the same call — use the return value.
- ❌ Untyped `any` payload at the boundary.
