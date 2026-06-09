// Test-only factory for `window.inmemnote`.
//
// Returns a fresh, fully-stubbed `InmemnoteAPI` per test so subscriptions and
// IPC calls can be inspected without touching real Electron. Every async method
// resolves to a sensible default DTO; every `on*` subscriber returns a no-op
// unsubscribe. Callers override individual methods via `Object.assign` to wire
// in test-specific responses or `vi.fn()` spies.
import { vi } from 'vitest';

import type {
  AppSettingsDTO,
  DraftDTO,
  NoteDTO,
} from '@infrastructure/electron/ipc-channels';
import type { InmemnoteAPI } from '@infrastructure/electron/preload/index';

export function emptyDraftDTO(overrides: Partial<DraftDTO> = {}): DraftDTO {
  return {
    id: 'draft-1',
    content: '',
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function noteDTO(overrides: Partial<NoteDTO> = {}): NoteDTO {
  return {
    id: 'note-1',
    title: 'Note title',
    content: 'Note title\nbody line',
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function settingsDTO(overrides: Partial<AppSettingsDTO> = {}): AppSettingsDTO {
  return {
    themeMode: 'system',
    language: 'en',
    palette: {},
    openDraftHotkey: 'CommandOrControl+Shift+Space',
    ...overrides,
  };
}

export function createInmemnoteApiMock(): InmemnoteAPI {
  const noopUnsub = (): void => undefined;

  const api: InmemnoteAPI = {
    draft: {
      open: vi.fn(async () => emptyDraftDTO()),
      save: vi.fn(async (_id: string, _c: string) => emptyDraftDTO()),
      close: vi.fn(async () => undefined),
      togglePin: vi.fn(async () => emptyDraftDTO({ pinned: true })),
      hide: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      promote: vi.fn(async () => null),
      onHotkey: vi.fn(() => noopUnsub),
      onAnimationDone: vi.fn(() => noopUnsub),
      onAnimationStart: vi.fn(() => noopUnsub),
      onDragStart: vi.fn(() => noopUnsub),
      onDragEnd: vi.fn(() => noopUnsub),
      setPinSize: vi.fn(async () => undefined),
      resetPinSize: vi.fn(async () => undefined),
      getCorner: vi.fn(async () => 'tr' as const),
      onCustomSizeChanged: vi.fn(() => noopUnsub),
      beginResize: vi.fn(async () => undefined),
      onCornerChanged: vi.fn(() => noopUnsub),
      onHeaderHover: vi.fn(() => noopUnsub),
    },
    notes: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      create: vi.fn(async () => noteDTO()),
      save: vi.fn(async () => noteDTO()),
      togglePin: vi.fn(async () => noteDTO({ pinned: true })),
      delete: vi.fn(async () => undefined),
      search: vi.fn(async () => []),
      onChanged: vi.fn(() => noopUnsub),
    },
    settings: {
      load: vi.fn(async () => settingsDTO()),
      save: vi.fn(async (patch) => settingsDTO(patch)),
      onChanged: vi.fn(() => noopUnsub),
    },
  };

  return api;
}

export function installInmemnoteApiMock(): InmemnoteAPI {
  const api = createInmemnoteApiMock();
  (window as unknown as { inmemnote: InmemnoteAPI }).inmemnote = api;
  return api;
}
