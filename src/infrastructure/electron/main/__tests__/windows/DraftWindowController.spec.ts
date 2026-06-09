import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DraftWindowController as DraftWindowControllerCtor } from '../../windows/DraftWindowController';

/**
 * The Draft window controller is heavy on side effects: BrowserWindow,
 * `screen` (cursor + display geometry), and the `@inmemnote/window-events`
 * native addon (mouseDown/Up/Drag streams + header hover tracker).
 *
 * We mock each piece narrowly so we can poke behavior from the public API
 * (`applyPinState`, `hideIfUnpinned`, `setPinSize`, `beginResize`,
 * `resetPinSize`, `applyContentHeight`, `toggle`).
 */

interface MockWin {
  setBounds: ReturnType<typeof vi.fn>;
  getBounds: ReturnType<typeof vi.fn>;
  getSize: ReturnType<typeof vi.fn>;
  setAlwaysOnTop: ReturnType<typeof vi.fn>;
  setVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>;
  setMovable: ReturnType<typeof vi.fn>;
  setContentProtection: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
  isAlwaysOnTop: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  loadFile: ReturnType<typeof vi.fn>;
  getNativeWindowHandle: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  webContents: {
    on: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
  };
  _bounds: { x: number; y: number; width: number; height: number };
  _handlers: Map<string, () => void>;
}

let win: MockWin;
const sendMock = vi.fn();

function makeWin(): MockWin {
  const w: MockWin = {
    setBounds: vi.fn((b: { x: number; y: number; width: number; height: number }) => {
      w._bounds = { ...b };
    }),
    getBounds: vi.fn(() => ({ ...w._bounds })),
    getSize: vi.fn(() => [w._bounds.width, w._bounds.height]),
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    setMovable: vi.fn(),
    setContentProtection: vi.fn(),
    isVisible: vi.fn().mockReturnValue(false),
    isAlwaysOnTop: vi.fn().mockReturnValue(false),
    isDestroyed: vi.fn().mockReturnValue(false),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    getNativeWindowHandle: vi.fn(() => Buffer.alloc(0)),
    on: vi.fn((event: string, cb: () => void) => {
      w._handlers.set(event, cb);
    }),
    once: vi.fn(),
    webContents: {
      on: vi.fn(),
      send: sendMock,
      once: vi.fn(),
    },
    _bounds: { x: 0, y: 0, width: 560, height: 220 },
    _handlers: new Map(),
  };
  return w;
}

// --- electron mock ---
const cursor = { x: 500, y: 400 };
const display = {
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
};

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(() => {
    win = makeWin();
    return win;
  }),
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ ...cursor })),
    getDisplayNearestPoint: vi.fn(() => display),
    getDisplayMatching: vi.fn(() => display),
  },
}));

// --- native addon mock ---
const handlers = {
  mouseDown: null as null | (() => void),
  mouseUp: null as null | (() => void),
  mouseDrag: null as null | (() => void),
  hover: null as null | ((b: boolean) => void),
};

vi.mock('@inmemnote/window-events', () => ({
  subscribeToMouseDown: vi.fn((cb: () => void) => {
    handlers.mouseDown = cb;
  }),
  subscribeToMouseUp: vi.fn((cb: () => void) => {
    handlers.mouseUp = cb;
  }),
  subscribeToMouseDrag: vi.fn((cb: () => void) => {
    handlers.mouseDrag = cb;
  }),
  installHeaderHoverTracker: vi.fn((_h: Buffer, _height: number, cb: (b: boolean) => void) => {
    handlers.hover = cb;
  }),
  unsubscribe: vi.fn(),
}));

let DraftWindowController: typeof DraftWindowControllerCtor;

beforeEach(async () => {
  vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
  vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
  sendMock.mockClear();
  handlers.mouseDown = null;
  handlers.mouseUp = null;
  handlers.mouseDrag = null;
  handlers.hover = null;
  cursor.x = 500;
  cursor.y = 400;
  ({ DraftWindowController } = await import('../../windows/DraftWindowController'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DraftWindowController.constructor', () => {
  it('creates a BrowserWindow with content protection enabled', () => {
    new DraftWindowController();
    expect(win.setContentProtection).toHaveBeenCalledWith(true);
  });

  it('subscribes to the three native mouse streams and the hover tracker', () => {
    new DraftWindowController();
    expect(handlers.mouseDown).toBeTypeOf('function');
    expect(handlers.mouseUp).toBeTypeOf('function');
    expect(handlers.mouseDrag).toBeTypeOf('function');
    expect(handlers.hover).toBeTypeOf('function');
  });
});

describe('toggle', () => {
  it('hides a visible window and skips the show path', () => {
    const c = new DraftWindowController();
    win.isVisible.mockReturnValue(true);
    c.toggle();
    expect(win.hide).toHaveBeenCalledOnce();
    expect(win.show).not.toHaveBeenCalled();
  });

  it('centers on the cursor display then shows and broadcasts the hotkey event', () => {
    const c = new DraftWindowController();
    win.isVisible.mockReturnValue(false);
    c.toggle();
    expect(win.setBounds).toHaveBeenCalled();
    const args = win.setBounds.mock.calls[0]!;
    const target = args[0] as { x: number; y: number; width: number; height: number };
    expect(target.width).toBe(560);
    // 1920 wide centered on 560 wide → (1920-560)/2 = 680
    expect(target.x).toBe(680);
    expect(win.show).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledWith('draft:hotkey');
  });
});

describe('hideIfUnpinned', () => {
  it('hides when the window is visible AND not pinned', () => {
    const c = new DraftWindowController();
    win.isVisible.mockReturnValue(true);
    win.isAlwaysOnTop.mockReturnValue(false);
    c.hideIfUnpinned();
    expect(win.hide).toHaveBeenCalledOnce();
  });

  it('stays put when pinned', () => {
    const c = new DraftWindowController();
    win.isVisible.mockReturnValue(true);
    win.isAlwaysOnTop.mockReturnValue(true);
    c.hideIfUnpinned();
    expect(win.hide).not.toHaveBeenCalled();
  });
});

describe('applyPinState', () => {
  it('pin=true flips always-on-top + movable and snaps to last corner', () => {
    const c = new DraftWindowController();
    c.applyPinState(true, 200);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating');
    expect(win.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true });
    expect(win.setMovable).toHaveBeenCalledWith(true);
    // Default corner is 'tr' — x should land at workArea.x + width - 320 - 24.
    const last = win.setBounds.mock.calls.at(-1)!;
    const target = last[0] as { x: number; y: number; width: number; height: number };
    expect(target.x).toBe(1920 - 320 - 24);
    expect(target.y).toBe(24);
    expect(target.width).toBe(320);
    expect(target.height).toBe(200);
  });

  it('pin=false centers the window on the cursor display', () => {
    const c = new DraftWindowController();
    c.applyPinState(false, 220);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false, 'floating');
    expect(win.setMovable).toHaveBeenCalledWith(false);
    const last = win.setBounds.mock.calls.at(-1)!;
    const target = last[0] as { x: number; y: number; width: number; height: number };
    expect(target.width).toBe(560);
  });
});

describe('applyContentHeight', () => {
  it('writes new height when delta exceeds 2px', () => {
    const c = new DraftWindowController();
    c.applyContentHeight(320);
    const last = win.setBounds.mock.calls.at(-1)!;
    const b = last[0] as { height: number };
    expect(b.height).toBe(320);
  });

  it('is a no-op when the delta is below the threshold', () => {
    const c = new DraftWindowController();
    win._bounds.height = 220;
    win.setBounds.mockClear();
    c.applyContentHeight(221);
    expect(win.setBounds).not.toHaveBeenCalled();
  });

  it('clamps to the pinned bracket [180, 360] when pinned', () => {
    const c = new DraftWindowController();
    c.applyPinState(true, 220);
    // Settle the pin animation so subsequent applyContentHeight runs.
    const after = win.setBounds.mock.calls.at(-1)!;
    win._bounds = { ...(after[0] as typeof win._bounds) };
    win._handlers.get('move')!();
    win.setBounds.mockClear();
    c.applyContentHeight(9999);
    const b = win.setBounds.mock.calls.at(-1)![0] as { height: number };
    expect(b.height).toBe(360);
  });

  it('is ignored while a pin animation is in flight', () => {
    const c = new DraftWindowController();
    c.applyPinState(true, 220); // triggers animateBounds → pinAnimating
    win.setBounds.mockClear();
    c.applyContentHeight(280);
    expect(win.setBounds).not.toHaveBeenCalled();
  });
});

describe('setPinSize', () => {
  it('does nothing when unpinned', () => {
    const c = new DraftWindowController();
    win.setBounds.mockClear();
    c.setPinSize({ width: 400, height: 300 });
    expect(win.setBounds).not.toHaveBeenCalled();
  });

  it('clamps, anchors at the pinned corner, and broadcasts custom-size active', () => {
    const c = new DraftWindowController();
    // Manually set pinned=true via applyPinState then resolve animation.
    c.applyPinState(true, 220);
    // Settle the animation: move handler fires when bounds reach target.
    const targetCall = win.setBounds.mock.calls.at(-1)!;
    win._bounds = { ...(targetCall[0] as typeof win._bounds) };
    win._handlers.get('move')!();

    sendMock.mockClear();
    win.setBounds.mockClear();
    c.setPinSize({ width: 500, height: 300 });

    // Custom-size signal emitted exactly once
    expect(sendMock).toHaveBeenCalledWith('draft:customSizeChanged', true);
    // Window placed at the tr corner with the new clamped size
    const b = win.setBounds.mock.calls.at(-1)![0] as { x: number; width: number; height: number };
    expect(b.width).toBe(500);
    expect(b.height).toBe(300);
    expect(b.x).toBe(1920 - 500 - 24);
  });
});

describe('beginResize', () => {
  it('captures starting state and disables movable when pinned', () => {
    const c = new DraftWindowController();
    c.applyPinState(true, 220);
    // settle animation
    const targetCall = win.setBounds.mock.calls.at(-1)!;
    win._bounds = { ...(targetCall[0] as typeof win._bounds) };
    win._handlers.get('move')!();

    win.setMovable.mockClear();
    c.beginResize();
    expect(win.setMovable).toHaveBeenCalledWith(false);
  });

  it('does nothing when not pinned', () => {
    const c = new DraftWindowController();
    win.setMovable.mockClear();
    c.beginResize();
    expect(win.setMovable).not.toHaveBeenCalled();
  });
});

describe('resetPinSize', () => {
  it('clears custom size and animates back to default', () => {
    vi.useFakeTimers();
    const c = new DraftWindowController();
    c.applyPinState(true, 220);
    // settle
    const after = win.setBounds.mock.calls.at(-1)!;
    win._bounds = { ...(after[0] as typeof win._bounds) };
    win._handlers.get('move')!();
    // Activate custom size
    c.setPinSize({ width: 480, height: 320 });
    sendMock.mockClear();
    win.setBounds.mockClear();

    // Move bounds away so animateBounds doesn't short-circuit
    win._bounds = { x: 0, y: 0, width: 480, height: 320 };
    c.resetPinSize();

    // Custom-size cleared signal
    expect(sendMock).toHaveBeenCalledWith('draft:customSizeChanged', false);
    // Animation start signal + a bounds update toward the design default
    expect(sendMock).toHaveBeenCalledWith('draft:animationStart');
    const b = win.setBounds.mock.calls.at(-1)![0] as { width: number; height: number };
    expect(b.width).toBe(320);
    expect(b.height).toBe(220);
  });
});

describe('getCorner', () => {
  it('defaults to top-right', () => {
    const c = new DraftWindowController();
    expect(c.getCorner()).toBe('tr');
  });
});

describe('public getters', () => {
  it('exposes the underlying BrowserWindow', () => {
    const c = new DraftWindowController();
    expect(c.browserWindow()).toBe(win);
  });

  it('webContents returns null after destruction', () => {
    const c = new DraftWindowController();
    expect(c.webContents()).toBe(win.webContents);
    win.isDestroyed.mockReturnValue(true);
    expect(c.webContents()).toBeNull();
  });

  it('isVisible reflects the underlying window', () => {
    const c = new DraftWindowController();
    win.isVisible.mockReturnValue(true);
    expect(c.isVisible()).toBe(true);
  });
});
