import { IPC, type InmemnoteAPI } from '@shared/ipc';

/**
 * The preload script is the security boundary between the renderer and
 * main: whatever it hands to `contextBridge.exposeInMainWorld` is the whole
 * surface the UI can reach. We replace `electron` with a tiny in-memory
 * bridge — `invoke` echoes the channel + args back, `send` replays a
 * main-side broadcast to registered listeners — and assert on what the
 * exposed API returns and what reaches the renderer's handlers.
 */
const bridge = vi.hoisted(() => {
  type Listener = (event: unknown, ...args: unknown[]) => void;
  const listeners = new Map<string, Set<Listener>>();
  const exposed = new Map<string, unknown>();
  // Stand-in for `IpcRendererEvent`. It carries `sender` (the raw
  // ipcRenderer) in real Electron, so it must never leak to the renderer.
  const fakeEvent = { sender: 'raw-ipc-renderer' };

  return {
    exposed,
    fakeEvent,
    listenerCount: (channel: string): number => listeners.get(channel)?.size ?? 0,
    /** Simulate `webContents.send(channel, ...args)` from main. */
    send: (channel: string, ...args: unknown[]): void => {
      for (const l of listeners.get(channel) ?? []) l(fakeEvent, ...args);
    },
    reset: (): void => {
      listeners.clear();
      exposed.clear();
    },
    ipcRenderer: {
      invoke: async (channel: string, ...args: unknown[]) => ({ channel, args }),
      on: (channel: string, listener: Listener): void => {
        if (!listeners.has(channel)) listeners.set(channel, new Set());
        listeners.get(channel)!.add(listener);
      },
      removeListener: (channel: string, listener: Listener): void => {
        listeners.get(channel)?.delete(listener);
      },
    },
  };
});

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown): void => {
      bridge.exposed.set(key, value);
    },
  },
  ipcRenderer: bridge.ipcRenderer,
}));

async function loadPreload(): Promise<InmemnoteAPI> {
  vi.resetModules();
  await import('./index');
  return bridge.exposed.get('inmemnote') as InmemnoteAPI;
}

describe('preload bridge', () => {
  let api: InmemnoteAPI;

  beforeEach(async () => {
    bridge.reset();
    vi.stubEnv('INMEMNOTE_E2E', '');
    api = await loadPreload();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('exposed surface', () => {
    it('exposes the typed API as window.inmemnote with exactly four namespaces', () => {
      expect(api).toBeDefined();
      expect(Object.keys(api).sort()).toEqual(['draft', 'notes', 'settings', 'storage', 'update']);
    });

    it('does not leak raw ipcRenderer or Node primitives through the bridge', () => {
      const values = Object.values(api).flatMap((ns) => Object.values(ns));

      expect(values.every((v) => typeof v === 'function')).toBe(true);
      expect(values).not.toContain(bridge.ipcRenderer.invoke);
      expect(values).not.toContain(bridge.ipcRenderer.on);
    });

    it('does not expose the e2e test bridge in a normal launch', () => {
      expect([...bridge.exposed.keys()]).toEqual(['inmemnote']);
    });
  });

  describe('request/response methods route to the right IPC channel', () => {
    const filter = 'pinned' as const;
    const patch = { themeMode: 'light' } as const;
    const size = { width: 320, height: 240 };

    const cases: Array<[string, (a: InmemnoteAPI) => Promise<unknown>, string, unknown[]]> = [
      ['draft.open', (a) => a.draft.open(), IPC.DraftOpen, []],
      ['draft.save', (a) => a.draft.save('d1', '# hi'), IPC.DraftSave, ['d1', '# hi']],
      ['draft.close', (a) => a.draft.close('d1'), IPC.DraftClose, ['d1']],
      ['draft.togglePin', (a) => a.draft.togglePin('d1', 180), IPC.DraftTogglePin, ['d1', 180]],
      [
        'draft.togglePin without height',
        (a) => a.draft.togglePin('d1'),
        IPC.DraftTogglePin,
        ['d1', undefined],
      ],
      ['draft.hide', (a) => a.draft.hide(), IPC.DraftHide, []],
      ['draft.resize', (a) => a.draft.resize(412), IPC.DraftResize, [412]],
      ['draft.promote', (a) => a.draft.promote('d1'), IPC.DraftPromote, ['d1']],
      ['draft.setPinSize', (a) => a.draft.setPinSize(size), IPC.DraftSetPinSize, [size]],
      ['draft.resetPinSize', (a) => a.draft.resetPinSize(), IPC.DraftResetPinSize, []],
      ['draft.getCorner', (a) => a.draft.getCorner(), IPC.DraftGetCorner, []],
      ['draft.beginResize', (a) => a.draft.beginResize(), IPC.DraftBeginResize, []],
      ['notes.list', (a) => a.notes.list(filter), IPC.NotesList, [filter]],
      ['notes.get', (a) => a.notes.get('n1'), IPC.NotesGet, ['n1']],
      ['notes.create', (a) => a.notes.create(), IPC.NotesCreate, []],
      ['notes.save', (a) => a.notes.save('n1', 'body'), IPC.NotesSave, ['n1', 'body']],
      ['notes.togglePin', (a) => a.notes.togglePin('n1'), IPC.NotesTogglePin, ['n1']],
      ['notes.delete', (a) => a.notes.delete('n1'), IPC.NotesDelete, ['n1']],
      ['notes.search', (a) => a.notes.search('milk'), IPC.NotesSearch, ['milk']],
      ['settings.load', (a) => a.settings.load(), IPC.SettingsLoad, []],
      ['settings.save', (a) => a.settings.save(patch), IPC.SettingsSave, [patch]],
      ['update.check', (a) => a.update.check(), IPC.UpdateCheck, []],
      ['update.install', (a) => a.update.install(), IPC.UpdateInstall, []],
      ['storage.status', (a) => a.storage.status(), IPC.StorageStatus, []],
    ];

    it.each(cases)('%s', async (_name, call, channel, args) => {
      await expect(call(api)).resolves.toEqual({ channel, args });
    });

    it('propagates a rejection from main to the caller', async () => {
      const original = bridge.ipcRenderer.invoke;
      bridge.ipcRenderer.invoke = async () => {
        throw new Error('validation failed');
      };
      try {
        await expect(api.settings.save(patch)).rejects.toThrow('validation failed');
      } finally {
        bridge.ipcRenderer.invoke = original;
      }
    });
  });

  describe('broadcast subscriptions', () => {
    type Subscribe = (a: InmemnoteAPI, handler: (...args: unknown[]) => void) => () => void;

    // [name, subscribe, channel main sends on, payload main sends (none = signal only)]
    const cases: Array<[string, Subscribe, string, unknown[]]> = [
      ['draft.onHotkey', (a, h) => a.draft.onHotkey(h), 'draft:hotkey', []],
      ['draft.onAnimationDone', (a, h) => a.draft.onAnimationDone(h), 'draft:animationDone', []],
      ['draft.onAnimationStart', (a, h) => a.draft.onAnimationStart(h), 'draft:animationStart', []],
      ['draft.onDragStart', (a, h) => a.draft.onDragStart(h), 'draft:dragStart', []],
      ['draft.onDragEnd', (a, h) => a.draft.onDragEnd(h), 'draft:dragEnd', []],
      [
        'draft.onCustomSizeChanged',
        (a, h) => a.draft.onCustomSizeChanged(h),
        IPC.DraftCustomSizeChanged,
        [true],
      ],
      [
        'draft.onCornerChanged',
        (a, h) => a.draft.onCornerChanged(h),
        'draft:cornerChanged',
        ['bl'],
      ],
      ['draft.onHeaderHover', (a, h) => a.draft.onHeaderHover(h), IPC.DraftHeaderHover, [false]],
      ['notes.onChanged', (a, h) => a.notes.onChanged(h), IPC.NotesChanged, []],
      [
        'settings.onChanged',
        (a, h) => a.settings.onChanged(h),
        IPC.SettingsChanged,
        [{ themeMode: 'dark', language: 'en', palette: {}, openDraftHotkey: 'F1' }],
      ],
      [
        'update.onAvailable',
        (a, h) => a.update.onAvailable(h),
        IPC.UpdateAvailable,
        [{ version: '0.7.0', downloadUrl: 'https://x/dl', notesUrl: 'https://x/notes' }],
      ],
      ['update.onProgress', (a, h) => a.update.onProgress(h), IPC.UpdateProgress, [0.42]],
      [
        'storage.onChanged',
        (a, h) => a.storage.onChanged(h),
        IPC.StorageChanged,
        [{ degraded: [{ store: 'notes', reason: 'database or disk is full' }] }],
      ],
    ];

    it.each(cases)(
      '%s delivers the payload without the IPC event object',
      (_name, subscribe, channel, payload) => {
        const received: unknown[][] = [];
        subscribe(api, (...args) => received.push(args));

        bridge.send(channel, ...payload);

        expect(received).toEqual([payload]);
      },
    );

    it.each(cases)(
      '%s stops delivering after unsubscribe',
      (_name, subscribe, channel, payload) => {
        const received: unknown[][] = [];
        const unsubscribe = subscribe(api, (...args) => received.push(args));

        unsubscribe();
        bridge.send(channel, ...payload);

        expect(received).toEqual([]);
        expect(bridge.listenerCount(channel)).toBe(0);
      },
    );

    it('unsubscribing one handler keeps the other subscribers on the same channel', () => {
      const first: number[] = [];
      const second: number[] = [];
      const offFirst = api.update.onProgress((f) => first.push(f));
      api.update.onProgress((f) => second.push(f));

      offFirst();
      bridge.send(IPC.UpdateProgress, 0.5);

      expect(first).toEqual([]);
      expect(second).toEqual([0.5]);
    });

    it('ignores broadcasts on channels the handler did not subscribe to', () => {
      const received: unknown[] = [];
      api.draft.onDragStart(() => received.push('drag'));

      bridge.send('draft:dragEnd');
      bridge.send(IPC.NotesChanged);

      expect(received).toEqual([]);
    });
  });

  describe('e2e test bridge', () => {
    it('is exposed only when launched with INMEMNOTE_E2E=1', async () => {
      bridge.reset();
      vi.stubEnv('INMEMNOTE_E2E', '1');

      await loadPreload();

      expect([...bridge.exposed.keys()].sort()).toEqual(['__inmemnote_test__', 'inmemnote']);
    });

    it('is not exposed for any other value of INMEMNOTE_E2E', async () => {
      bridge.reset();
      vi.stubEnv('INMEMNOTE_E2E', 'true');

      await loadPreload();

      expect(bridge.exposed.has('__inmemnote_test__')).toBe(false);
    });

    it('routes showDraft / hideDraft to the test-only channels', async () => {
      bridge.reset();
      vi.stubEnv('INMEMNOTE_E2E', '1');
      await loadPreload();
      const testApi = bridge.exposed.get('__inmemnote_test__') as {
        showDraft: () => Promise<unknown>;
        hideDraft: () => Promise<unknown>;
      };

      await expect(testApi.showDraft()).resolves.toEqual({
        channel: '__test__:showDraft',
        args: [],
      });
      await expect(testApi.hideDraft()).resolves.toEqual({
        channel: '__test__:hideDraft',
        args: [],
      });
    });
  });
});
