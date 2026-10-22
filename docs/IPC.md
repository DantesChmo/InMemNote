# IPC contracts

> Co-owned by `react-electron-developer` (renderer side) and
> `nodejs-backend-developer` (main side). Every cross-process call has a
> row here. Adding or renaming a channel requires updating both sides and
> this document in the same change.

## Rules

- All IPC goes through `preload` via `contextBridge.exposeInMainWorld`. The
  renderer never imports from `electron` directly (enforced by ESLint).
- Channel payloads are **typed**. The contract — channel names, DTOs and the
  `window.inmemnote` API type (`InmemnoteAPI`) — lives in
  [`src/shared/ipc/`](../src/shared/ipc/), one file per context
  ([ADR 0002](./adr/0002-ipc-contracts-module.md)). Main, preload and the
  renderer all import it as `@shared/ipc`; nothing in `src/presentation`
  may import `@infrastructure/*`.
- Inbound payloads from renderer to main are **Zod-validated** at the main-
  side handler before being passed into a use-case (see
  [Validation](#validation)).
- Channels are named `<noun>:<verb>` (e.g. `draft:save`, `draft:open`).
- Channels are versioned in name only when an incompatible change ships
  (`draft:save@v2`); never silently change a payload shape.

## Where things live

| What | Where |
|---|---|
| Channel names (`DraftChannels`, `NotesChannels`, …) merged into `IPC` | `src/shared/ipc/<context>.ts`, `src/shared/ipc/channels.ts` |
| DTOs (`DraftDTO`, `NoteDTO`, `AppSettingsDTO`, …) | `src/shared/ipc/<context>.ts` |
| Renderer API (`InmemnoteAPI` = `DraftBridge` + `NotesBridge` + …) | `src/shared/ipc/<context>.ts`, `src/shared/ipc/api.ts` |
| Preload implementation (`const api: InmemnoteAPI`) | `src/infrastructure/electron/preload/index.ts` |
| Main-side handlers | `src/infrastructure/electron/main/ipc/<context>.ts` |
| Zod schemas for inbound payloads | `src/infrastructure/electron/main/ipc/<context>.schemas.ts` |
| Validation helper (`parseIpcArgs`, `IpcValidationError`) | `src/infrastructure/electron/main/ipc/validate.ts` |

`src/shared/ipc` is pure TypeScript with no dependencies (no `zod`,
`electron` or `react`), so preload and the renderer never bundle Zod.

## Validation

Every `ipcMain.handle` callback that takes arguments receives them as
`(...args: unknown[])` and first calls

```ts
const [id, content] = parseIpcArgs(IPC.NotesSave, NotesSaveArgs, args);
```

- Each schema is a **Zod tuple** of the positional `invoke` arguments.
  Extra arguments are rejected; missing trailing `.optional()` arguments are
  treated as `undefined` (`invoke(ch, id)` ≡ `invoke(ch, id, undefined)`).
- On failure the handler throws `IpcValidationError` **before** any
  use-case, repository or window-controller call. Electron forwards the
  message to the renderer as a rejected `invoke()` promise, e.g.
  `Invalid IPC payload for "notes:save": [1]: Expected string, received number`
  (`[i]` is the argument index, `.field` the property).
- Schemas pin the **transport shape** only (types, enum members, known
  keys, finite numbers). Value rules stay in the domain: id format in
  `DraftId`/`NoteId.create`, hex colours and hotkey vocabulary in the
  settings parser. Objects are `.strict()` — an unknown key means the two
  sides drifted.
- Schemas that mirror a DTO use `satisfies z.ZodType<…DTO>` so a DTO change
  that the schema can't accept fails `tsc`.

## Adding a channel

1. Add the key to the context's `*Channels` map in `src/shared/ipc/<context>.ts`
   (a new context gets a new file, one spread in `channels.ts` and one
   member in `api.ts`). `channels.spec.ts` fails on a duplicate key or name.
2. Add or reuse the DTO and the method on the context's `*Bridge` interface.
3. Implement the method in preload (`invoke` or `subscribe`).
4. Renderer → main with a payload: add a tuple schema to
   `main/ipc/<context>.schemas.ts`, call `parseIpcArgs` first in the handler,
   and cover invalid input in `main/__tests__/ipc/<context>.spec.ts`.
5. Add the row below.

## Channels

Direction: **R→M** = renderer `invoke`s, main `handle`s (request/response);
**M→R** = main `webContents.send`s, renderer subscribes via an `on*` method.
Main-side paths are relative to `src/infrastructure/electron/main/`.

### Draft (`window.inmemnote.draft`)

| Channel | Direction | Payload | Response | Owner (main-side) | Notes |
|---|---|---|---|---|---|
| `draft:open` | R→M | — | `DraftDTO` | `ipc/draft.ts` | Creates a fresh draft and persists it so later calls can address it by id. |
| `draft:save` | R→M | `id: string, content: string` | `DraftDTO` | `ipc/draft.ts` | Schema `DraftSaveArgs`. |
| `draft:close` | R→M | `id: string` | `void` | `ipc/draft.ts` | Schema `DraftIdArgs`. |
| `draft:togglePin` | R→M | `id: string, targetHeight?: number` | `DraftDTO` | `ipc/draft.ts` | `targetHeight` finite, ≥ 0: the predicted post-toggle height, so the window animates once. |
| `draft:hide` | R→M | — | `void` | `ipc/draft.ts` | Hides only if unpinned. |
| `draft:resize` | R→M | `height: number` | `void` | `ipc/draft.ts` | Finite; clamped by the controller to the mode's range. |
| `draft:promote` | R→M | `id: string` | `NoteDTO \| null` | `ipc/draft.ts` | ⌘↵. `null` = empty draft discarded. Broadcasts `notes:changed` on success. |
| `draft:setPinSize` | R→M | `{ width: number, height: number }` | `void` | `ipc/draft.ts` | Strict object, finite numbers; clamped to the pin bracket. |
| `draft:resetPinSize` | R→M | — | `void` | `ipc/draft.ts` | Back to the default pin size. |
| `draft:getCorner` | R→M | — | `Corner` | `ipc/draft.ts` | `'tl' \| 'tr' \| 'bl' \| 'br'`. |
| `draft:beginResize` | R→M | — | `void` | `ipc/draft.ts` | Main follows the native mouse-drag stream until mouse-up. |
| `draft:hotkey` | M→R | — | — | `windows/DraftWindowController.ts` | Global hotkey pressed. |
| `draft:dragStart` | M→R | — | — | `windows/DraftWindowController.ts` | Header drag of the pinned window began. |
| `draft:dragEnd` | M→R | — | — | `windows/DraftWindowController.ts` | Header drag ended. |
| `draft:animationStart` | M→R | — | — | `windows/DraftWindowController.ts` | Renderer pauses ResizeObserver-driven `draft:resize`. |
| `draft:animationDone` | M→R | — | — | `windows/DraftWindowController.ts` | Renderer remeasures and sends `draft:resize`. |
| `draft:cornerChanged` | M→R | `Corner` | — | `windows/DraftWindowController.ts` | Pin snapped to another corner. |
| `draft:customSizeChanged` | M→R | `boolean` | — | `windows/DraftWindowController.ts` | `true` = user-sized, editor fills the window. |
| `draft:headerHover` | M→R | `boolean` | — | `windows/DraftWindowController.ts` | From `NSTrackingArea`; pinned mode only. |

### Notes (`window.inmemnote.notes`)

| Channel | Direction | Payload | Response | Owner (main-side) | Notes |
|---|---|---|---|---|---|
| `notes:list` | R→M | `filter: 'all' \| 'pinned'` | `NoteDTO[]` | `ipc/notes.ts` | Pinned first, then `updatedAt` desc. |
| `notes:get` | R→M | `id: string` | `NoteDTO \| null` | `ipc/notes.ts` | |
| `notes:create` | R→M | — | `NoteDTO` | `ipc/notes.ts` | Broadcasts `notes:changed`. |
| `notes:save` | R→M | `id: string, content: string` | `NoteDTO` | `ipc/notes.ts` | Broadcasts `notes:changed`. Empty content is valid. |
| `notes:togglePin` | R→M | `id: string` | `NoteDTO` | `ipc/notes.ts` | Broadcasts `notes:changed`. |
| `notes:delete` | R→M | `id: string` | `void` | `ipc/notes.ts` | Broadcasts `notes:changed`. |
| `notes:search` | R→M | `query: string` | `NoteDTO[]` | `ipc/notes.ts` | |
| `notes:changed` | M→R | — | — | `index.ts` (`emitNotesChanged`) | Library refetches its list. |

### Settings (`window.inmemnote.settings`)

| Channel | Direction | Payload | Response | Owner (main-side) | Notes |
|---|---|---|---|---|---|
| `settings:load` | R→M | — | `AppSettingsDTO` | `ipc/settings.ts` | Defaults merged with persisted overrides. |
| `settings:save` | R→M | `patch: AppSettingsPatchDTO` | `AppSettingsDTO` | `ipc/settings.ts` | Strict partial object. Merged with current settings, re-validated by the domain, persisted, hotkey re-registered if changed, then broadcast. |
| `settings:changed` | M→R | `AppSettingsDTO` | — | `ipc/settings.ts` | After every save, and pushed to each window on load (`pushTo`). |

### Update (`window.inmemnote.update`)

| Channel | Direction | Payload | Response | Owner (main-side) | Notes |
|---|---|---|---|---|---|
| `update:check` | R→M | — | `AvailableUpdateDTO \| null` | `ipc/update.ts` | Also broadcasts `update:available` when found. Offline = `null`, not an error. |
| `update:install` | R→M | — | `void` | `ipc/update.ts` | Rejects on failure; on success the app quits. |
| `update:available` | M→R | `AvailableUpdateDTO` | — | `ipc/update.ts` | From startup / periodic / explicit check. |
| `update:progress` | M→R | `number` (0..1) | — | `index.ts` | Download progress during install. |

### E2E only (`window.__inmemnote_test__`, `INMEMNOTE_E2E=1`)

| Channel | Direction | Payload | Response | Owner (main-side) | Notes |
|---|---|---|---|---|---|
| `__test__:showDraft` | R→M | — | `void` | `e2e.ts` | Toggles the Draft window without the OS hotkey. |
| `__test__:hideDraft` | R→M | — | `void` | `e2e.ts` | Hides the Draft window if visible. |

## Anti-patterns

- ❌ Renderer reading filesystem or invoking Node APIs.
- ❌ Main-side handler that calls another `BrowserWindow.webContents.send`
  back into the same call — use the return value.
- ❌ Untyped `any` payload at the boundary, or a handler that casts its
  arguments (`filter as NoteListFilter`) instead of parsing them.
- ❌ A channel name as a raw string literal outside `src/shared/ipc`.
