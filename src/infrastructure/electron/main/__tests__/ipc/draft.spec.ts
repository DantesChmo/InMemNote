import { IPC } from '@shared/ipc';
import { ok } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { registerDraftIpc as RegisterDraftIpcFn } from '../../ipc/draft';

const handlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (e: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, cb);
    }),
  },
}));

let registerDraftIpc: typeof RegisterDraftIpcFn;

const VALID_ID = '11111111-1111-4111-8111-111111111111';

function makeDraft(overrides: Partial<{ pinned: boolean; content: string }> = {}): {
  id: string;
  content: { value: string };
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: VALID_ID,
    content: { value: overrides.content ?? 'hello' },
    pinned: overrides.pinned ?? false,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
}

function makeNote(): {
  id: string;
  content: { value: string };
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  title: () => string;
} {
  return {
    id: VALID_ID,
    content: { value: 'note' },
    pinned: false,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    title: () => 'note',
  };
}

beforeEach(async () => {
  handlers.clear();
  ({ registerDraftIpc } = await import('../../ipc/draft'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerDraftIpc', () => {
  function setup(
    opts: {
      ucOverrides?: Record<string, unknown>;
      controllerOverrides?: Record<string, unknown>;
    } = {},
  ): {
    controller: Record<string, ReturnType<typeof vi.fn>>;
    uc: Record<string, { execute: ReturnType<typeof vi.fn> }>;
    drafts: { save: ReturnType<typeof vi.fn> };
    emitNotesChanged: ReturnType<typeof vi.fn>;
  } {
    const controller = {
      applyPinState: vi.fn(),
      hideIfUnpinned: vi.fn(),
      applyContentHeight: vi.fn(),
      setPinSize: vi.fn(),
      getCorner: vi.fn(() => 'tr'),
      beginResize: vi.fn(),
      resetPinSize: vi.fn(),
      ...opts.controllerOverrides,
    };
    const uc = {
      openDraft: { execute: vi.fn(async () => makeDraft()) },
      saveDraft: { execute: vi.fn(async () => ok(makeDraft({ content: 'updated' }))) },
      closeDraft: { execute: vi.fn(async () => ok(undefined)) },
      togglePinDraft: { execute: vi.fn(async () => ok(makeDraft({ pinned: true }))) },
      promote: { execute: vi.fn(async () => ok(makeNote())) },
      ...opts.ucOverrides,
    };
    const drafts = { save: vi.fn(async () => undefined) };
    const emitNotesChanged = vi.fn();
    registerDraftIpc({
      controller: controller as never,
      drafts: drafts as never,
      uc: uc as never,
      emitNotesChanged,
    });
    return { controller, uc, drafts, emitNotesChanged };
  }

  it('registers every Draft channel', () => {
    setup();
    expect(handlers.has(IPC.DraftOpen)).toBe(true);
    expect(handlers.has(IPC.DraftSave)).toBe(true);
    expect(handlers.has(IPC.DraftClose)).toBe(true);
    expect(handlers.has(IPC.DraftTogglePin)).toBe(true);
    expect(handlers.has(IPC.DraftHide)).toBe(true);
    expect(handlers.has(IPC.DraftResize)).toBe(true);
    expect(handlers.has(IPC.DraftSetPinSize)).toBe(true);
    expect(handlers.has(IPC.DraftGetCorner)).toBe(true);
    expect(handlers.has(IPC.DraftBeginResize)).toBe(true);
    expect(handlers.has(IPC.DraftResetPinSize)).toBe(true);
    expect(handlers.has(IPC.DraftPromote)).toBe(true);
  });

  it('DraftOpen calls openDraft + saves and returns DTO', async () => {
    const { uc, drafts } = setup();
    const result = (await handlers.get(IPC.DraftOpen)!({})) as { id: string; content: string };
    expect(uc.openDraft!.execute).toHaveBeenCalled();
    expect(drafts.save).toHaveBeenCalled();
    expect(result.id).toBe(VALID_ID);
    expect(result.content).toBe('hello');
  });

  it('DraftSave parses the id and returns the updated DTO', async () => {
    const { uc } = setup();
    const result = (await handlers.get(IPC.DraftSave)!({}, VALID_ID, 'updated')) as {
      content: string;
    };
    expect(uc.saveDraft!.execute).toHaveBeenCalled();
    expect(result.content).toBe('updated');
  });

  it('DraftSave throws on an invalid id', async () => {
    setup();
    await expect(handlers.get(IPC.DraftSave)!({}, 'bad-id', '')).rejects.toThrow();
  });

  it('DraftTogglePin delegates the window-side effect to the controller', async () => {
    const { controller, uc } = setup();
    await handlers.get(IPC.DraftTogglePin)!({}, VALID_ID, 240);
    expect(uc.togglePinDraft!.execute).toHaveBeenCalled();
    expect(controller.applyPinState).toHaveBeenCalledWith(true, 240);
  });

  it('DraftHide / DraftResize / DraftSetPinSize / DraftBeginResize / DraftResetPinSize all proxy to the controller', async () => {
    const { controller } = setup();
    await handlers.get(IPC.DraftHide)!({});
    await handlers.get(IPC.DraftResize)!({}, 300);
    await handlers.get(IPC.DraftSetPinSize)!({}, { width: 400, height: 300 });
    await handlers.get(IPC.DraftBeginResize)!({});
    await handlers.get(IPC.DraftResetPinSize)!({});

    expect(controller.hideIfUnpinned).toHaveBeenCalled();
    expect(controller.applyContentHeight).toHaveBeenCalledWith(300);
    expect(controller.setPinSize).toHaveBeenCalledWith({ width: 400, height: 300 });
    expect(controller.beginResize).toHaveBeenCalled();
    expect(controller.resetPinSize).toHaveBeenCalled();
  });

  it('DraftGetCorner returns the controller value', async () => {
    const { controller } = setup({ controllerOverrides: { getCorner: vi.fn(() => 'bl') } });
    const result = await handlers.get(IPC.DraftGetCorner)!({});
    expect(controller.getCorner).toHaveBeenCalled();
    expect(result).toBe('bl');
  });

  it('DraftPromote broadcasts notes-changed and returns a Note DTO', async () => {
    const { emitNotesChanged } = setup();
    const result = (await handlers.get(IPC.DraftPromote)!({}, VALID_ID)) as { id: string };
    expect(emitNotesChanged).toHaveBeenCalled();
    expect(result.id).toBe(VALID_ID);
  });

  it('DraftPromote returns null without broadcasting when nothing was promoted', async () => {
    const promote = { execute: vi.fn(async () => ok(null)) };
    const { emitNotesChanged } = setup({ ucOverrides: { promote } });
    const result = await handlers.get(IPC.DraftPromote)!({}, VALID_ID);
    expect(result).toBeNull();
    expect(emitNotesChanged).not.toHaveBeenCalled();
  });

  describe('payload validation', () => {
    const invalid = /Invalid IPC payload for "draft:/;

    it.each([[42], [null], [{ body: 'x' }]])(
      'DraftSave rejects non-string content %j without calling the use-case',
      async (content) => {
        const { uc } = setup();
        await expect(handlers.get(IPC.DraftSave)!({}, VALID_ID, content)).rejects.toThrow(invalid);
        expect(uc.saveDraft!.execute).not.toHaveBeenCalled();
      },
    );

    it('DraftSave rejects a non-string id', async () => {
      const { uc } = setup();
      await expect(handlers.get(IPC.DraftSave)!({}, 1, 'x')).rejects.toThrow(invalid);
      expect(uc.saveDraft!.execute).not.toHaveBeenCalled();
    });

    it('DraftClose rejects a non-string id', async () => {
      const { uc } = setup();
      await expect(handlers.get(IPC.DraftClose)!({}, null)).rejects.toThrow(invalid);
      expect(uc.closeDraft!.execute).not.toHaveBeenCalled();
    });

    it('DraftTogglePin accepts an omitted target height', async () => {
      const { controller } = setup();
      await handlers.get(IPC.DraftTogglePin)!({}, VALID_ID);
      await handlers.get(IPC.DraftTogglePin)!({}, VALID_ID, undefined);
      expect(controller.applyPinState).toHaveBeenNthCalledWith(1, true, undefined);
      expect(controller.applyPinState).toHaveBeenNthCalledWith(2, true, undefined);
    });

    it.each([['240'], [Number.NaN], [Number.POSITIVE_INFINITY], [-10]])(
      'DraftTogglePin rejects target height %j',
      async (targetHeight) => {
        const { uc, controller } = setup();
        await expect(handlers.get(IPC.DraftTogglePin)!({}, VALID_ID, targetHeight)).rejects.toThrow(
          invalid,
        );
        expect(uc.togglePinDraft!.execute).not.toHaveBeenCalled();
        expect(controller.applyPinState).not.toHaveBeenCalled();
      },
    );

    it.each([['300'], [Number.NaN], [Number.NEGATIVE_INFINITY], [undefined]])(
      'DraftResize rejects height %j',
      async (height) => {
        const { controller } = setup();
        await expect(handlers.get(IPC.DraftResize)!({}, height)).rejects.toThrow(invalid);
        expect(controller.applyContentHeight).not.toHaveBeenCalled();
      },
    );

    it.each([
      [{ width: 400 }],
      [{ width: '400', height: 300 }],
      [{ width: 400, height: Number.NaN }],
      [{ width: 400, height: 300, x: 0 }],
      [[400, 300]],
      [null],
    ])('DraftSetPinSize rejects %j', async (size) => {
      const { controller } = setup();
      await expect(handlers.get(IPC.DraftSetPinSize)!({}, size)).rejects.toThrow(invalid);
      expect(controller.setPinSize).not.toHaveBeenCalled();
    });

    it('DraftPromote rejects a non-string id', async () => {
      const { uc, emitNotesChanged } = setup();
      await expect(handlers.get(IPC.DraftPromote)!({}, { id: VALID_ID })).rejects.toThrow(invalid);
      expect(uc.promote!.execute).not.toHaveBeenCalled();
      expect(emitNotesChanged).not.toHaveBeenCalled();
    });
  });
});
