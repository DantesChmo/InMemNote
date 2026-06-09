import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { registerE2eAffordances as RegisterE2eFn } from '../e2e';

const ipcHandlers = new Map<string, () => Promise<void>>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: () => Promise<void>) => {
      ipcHandlers.set(channel, cb);
    }),
  },
}));

let registerE2eAffordances: typeof RegisterE2eFn;

beforeEach(async () => {
  ipcHandlers.clear();
  (globalThis as { __inmemnoteTest?: unknown }).__inmemnoteTest = undefined;
  ({ registerE2eAffordances } = await import('../e2e'));
});

afterEach(() => {
  delete (globalThis as { __inmemnoteTest?: unknown }).__inmemnoteTest;
  vi.restoreAllMocks();
});

describe('registerE2eAffordances', () => {
  function makeController(visible = false): {
    toggle: ReturnType<typeof vi.fn>;
    isVisible: ReturnType<typeof vi.fn>;
    browserWindow: ReturnType<typeof vi.fn>;
    _hide: ReturnType<typeof vi.fn>;
  } {
    const hide = vi.fn();
    return {
      toggle: vi.fn(),
      isVisible: vi.fn(() => visible),
      browserWindow: vi.fn(() => ({ hide })),
      _hide: hide,
    };
  }

  it('registers both __test__ IPC channels', () => {
    registerE2eAffordances(makeController() as never);
    expect(ipcHandlers.has('__test__:showDraft')).toBe(true);
    expect(ipcHandlers.has('__test__:hideDraft')).toBe(true);
  });

  it('exposes a globalThis hook for Playwright app.evaluate', () => {
    registerE2eAffordances(makeController() as never);
    const handle = (globalThis as { __inmemnoteTest?: { showDraft: () => void; hideDraft: () => void } })
      .__inmemnoteTest;
    expect(handle).toBeDefined();
    expect(handle!.showDraft).toBeTypeOf('function');
    expect(handle!.hideDraft).toBeTypeOf('function');
  });

  it('showDraft channel toggles the controller', async () => {
    const c = makeController();
    registerE2eAffordances(c as never);
    await ipcHandlers.get('__test__:showDraft')!();
    expect(c.toggle).toHaveBeenCalled();
  });

  it('hideDraft hides only when the window is visible', async () => {
    const c = makeController(true);
    registerE2eAffordances(c as never);
    await ipcHandlers.get('__test__:hideDraft')!();
    expect(c._hide).toHaveBeenCalled();
  });

  it('hideDraft is a no-op when invisible', async () => {
    const c = makeController(false);
    registerE2eAffordances(c as never);
    await ipcHandlers.get('__test__:hideDraft')!();
    expect(c._hide).not.toHaveBeenCalled();
  });

  it('globalThis.showDraft toggles and hideDraft hides', () => {
    const c = makeController(true);
    registerE2eAffordances(c as never);
    const handle = (globalThis as unknown as { __inmemnoteTest: { showDraft: () => void; hideDraft: () => void } })
      .__inmemnoteTest;
    handle.showDraft();
    handle.hideDraft();
    expect(c.toggle).toHaveBeenCalled();
    expect(c._hide).toHaveBeenCalled();
  });
});
