import * as windowEvents from '@inmemnote/window-events';
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
interface FakeDisplay {
  workArea: { x: number; y: number; width: number; height: number };
}
const PRIMARY: FakeDisplay = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
// A second, differently sized monitor to the right of the primary one.
const SECONDARY: FakeDisplay = { workArea: { x: 1920, y: 0, width: 2560, height: 1440 } };
let displays: FakeDisplay[] = [PRIMARY];

const contains = (d: FakeDisplay, x: number, y: number): boolean =>
  x >= d.workArea.x &&
  x < d.workArea.x + d.workArea.width &&
  y >= d.workArea.y &&
  y < d.workArea.y + d.workArea.height;
const displayAt = (x: number, y: number): FakeDisplay =>
  displays.find((d) => contains(d, x, y)) ?? displays[0]!;

vi.mock('electron', () => ({
  // `function`, not an arrow: Vitest 4+ mocks are only `new`-able when the
  // implementation is.
  BrowserWindow: vi.fn(function () {
    win = makeWin();
    return win;
  }),
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ ...cursor })),
    getDisplayNearestPoint: vi.fn((p: { x: number; y: number }) => displayAt(p.x, p.y)),
    // Like Electron, pick the display the rectangle mostly sits on (its centre
    // is close enough for the bounds these specs use).
    getDisplayMatching: vi.fn((b: { x: number; y: number; width: number; height: number }) =>
      displayAt(b.x + b.width / 2, b.y + b.height / 2),
    ),
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
  displays = [PRIMARY];
  vi.mocked(windowEvents.unsubscribe).mockClear();
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

// ---------------------------------------------------------------------------
// Behavioural scenarios (TZ §2.1–2.3). They drive the controller through its
// public API and the native mouse streams, and assert on what the user would
// see: where the window ends up and which signals the renderer receives.
// ---------------------------------------------------------------------------

type Rect = { x: number; y: number; width: number; height: number };

const bounds = (): Rect => ({ ...win._bounds });

/** AppKit reports the last requested bounds: lets a running animation settle. */
const settle = (): void => win._handlers.get('move')!();

/** Pin the panel into the default (top-right) corner and let the animation land. */
function pinned(c: DraftWindowControllerCtor, height = 220): void {
  c.applyPinState(true, height);
  settle();
  sendMock.mockClear();
}

/** The user grabs the header (cursor inside it, left of the pin button). */
function pressHeader(): void {
  const b = bounds();
  cursor.x = b.x + 100;
  cursor.y = b.y + 20;
  handlers.mouseDown!();
}

/** AppKit moves the window under the cursor, then the button is released. */
function dragTo(x: number, y: number): void {
  win._bounds = { ...win._bounds, x, y };
  handlers.mouseUp!();
}

const sentChannels = (): string[] => sendMock.mock.calls.map((c) => c[0] as string);

describe('toggle (summon)', () => {
  it('does nothing once the window has been destroyed', () => {
    const c = new DraftWindowController();
    win.isDestroyed.mockReturnValue(true);
    c.toggle();
    expect(win.show).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });

  it('centres on the display under the cursor, keeping the current height', () => {
    const c = new DraftWindowController();
    displays = [PRIMARY, SECONDARY];
    cursor.x = 3000; // on the second monitor
    cursor.y = 200;
    win._bounds.height = 300;

    c.toggle();

    // 1920 + (2560 - 560) / 2, (1440 - 300) / 2
    expect(bounds()).toEqual({ x: 2920, y: 570, width: 560, height: 300 });
  });

  it('summons without an animation (no fly-in, unlike pin/unpin)', () => {
    const c = new DraftWindowController();
    c.toggle();
    expect(win.setBounds.mock.calls.at(-1)![1]).toBe(false);
    expect(sentChannels()).not.toContain('draft:animationStart');
  });
});

describe('blur', () => {
  it('hides an unpinned overlay when it loses focus', () => {
    new DraftWindowController();
    win.isVisible.mockReturnValue(true);
    win.isAlwaysOnTop.mockReturnValue(false);
    win._handlers.get('blur')!();
    expect(win.hide).toHaveBeenCalledOnce();
  });

  it('keeps a pinned overlay on screen when it loses focus', () => {
    new DraftWindowController();
    win.isVisible.mockReturnValue(true);
    win.isAlwaysOnTop.mockReturnValue(true);
    win._handlers.get('blur')!();
    expect(win.hide).not.toHaveBeenCalled();
  });

  it('does not hide a window that is already hidden', () => {
    new DraftWindowController();
    win.isVisible.mockReturnValue(false);
    win._handlers.get('blur')!();
    expect(win.hide).not.toHaveBeenCalled();
  });
});

describe('window teardown', () => {
  it('detaches the native mouse observers when the window closes', () => {
    new DraftWindowController();
    expect(windowEvents.unsubscribe).not.toHaveBeenCalled();
    win._handlers.get('closed')!();
    expect(windowEvents.unsubscribe).toHaveBeenCalled();
  });

  it('every entry point is a safe no-op on a destroyed window', () => {
    const c = new DraftWindowController();
    win.isDestroyed.mockReturnValue(true);
    expect(() => {
      c.hideIfUnpinned();
      c.applyPinState(true, 200);
      c.applyContentHeight(300);
      c.setPinSize({ width: 400, height: 300 });
      c.beginResize();
      c.resetPinSize();
      handlers.hover!(true);
      handlers.mouseDrag!();
    }).not.toThrow();
    expect(win.hide).not.toHaveBeenCalled();
    expect(win.setBounds).not.toHaveBeenCalled();
    expect(win.setAlwaysOnTop).not.toHaveBeenCalled();
  });
});

describe('pin / unpin', () => {
  it('pinning parks the panel 24 px from the top-right of the work area at 320 px wide', () => {
    const c = new DraftWindowController();
    c.applyPinState(true, 200);
    expect(bounds()).toEqual({ x: 1920 - 320 - 24, y: 24, width: 320, height: 200 });
  });

  it('pinning announces the animation, and finishes it the moment the window lands', () => {
    const c = new DraftWindowController();
    c.applyPinState(true, 200);
    expect(win.setBounds.mock.calls.at(-1)![1]).toBe(true);
    expect(sentChannels()).toContain('draft:animationStart');
    expect(sentChannels()).not.toContain('draft:animationDone');

    settle();

    expect(sentChannels()).toContain('draft:animationDone');
  });

  it('releases the animation lock via the timer when AppKit never reports the exact target', () => {
    vi.useFakeTimers();
    const c = new DraftWindowController();
    c.applyPinState(true, 200);
    // Pixel-rounding mismatch: the window stops one pixel short.
    win._bounds = { ...bounds(), x: bounds().x + 1 };
    settle();
    expect(sentChannels()).not.toContain('draft:animationDone');

    vi.advanceTimersByTime(400);

    expect(sentChannels()).toContain('draft:animationDone');
    // ...and the renderer may drive the height again.
    win.setBounds.mockClear();
    c.applyContentHeight(300);
    expect(win.setBounds).toHaveBeenCalled();
  });

  it('answers animationDone straight away when the window is already at the target', () => {
    const c = new DraftWindowController();
    c.applyPinState(true, 220);
    settle();
    c.applyPinState(false, 220);
    settle();
    c.applyPinState(true, 220); // back to the exact same pinned frame...
    settle();
    sendMock.mockClear();
    // ...and a second pin request lands on identical bounds: nothing to animate.
    c.applyPinState(true, 220);
    expect(sentChannels()).toEqual(['draft:animationDone']);
  });

  it('pinning also lets the panel follow the user across Spaces, and unpinning stops that', () => {
    const c = new DraftWindowController();
    c.applyPinState(true);
    expect(win.setVisibleOnAllWorkspaces).toHaveBeenLastCalledWith(true, {
      visibleOnFullScreen: true,
    });
    c.applyPinState(false);
    expect(win.setVisibleOnAllWorkspaces).toHaveBeenLastCalledWith(false, {
      visibleOnFullScreen: true,
    });
  });

  it('unpinning returns to 560 px centred on the display under the cursor now (multi-display)', () => {
    const c = new DraftWindowController();
    displays = [PRIMARY, SECONDARY];
    pinned(c);
    cursor.x = 3000; // user moved to the other monitor while pinned
    cursor.y = 300;

    c.applyPinState(false, 260);

    expect(bounds()).toEqual({ x: 2920, y: 590, width: 560, height: 260 });
  });

  it('re-pinning brings the panel back to the corner the user last left it in', () => {
    const c = new DraftWindowController();
    pinned(c);
    pressHeader();
    dragTo(40, 700); // dropped near the bottom-left
    settle();
    expect(c.getCorner()).toBe('bl');

    c.applyPinState(false, 220);
    settle();
    c.applyPinState(true, 220);

    expect(bounds()).toEqual({ x: 24, y: 1080 - 220 - 24, width: 320, height: 220 });
  });

  it('keeps the user-chosen pin size across unpin and re-pin until it is reset', () => {
    const c = new DraftWindowController();
    pinned(c);
    c.setPinSize({ width: 480, height: 300 });
    c.applyPinState(false, 220);
    settle();

    c.applyPinState(true);

    expect(bounds()).toMatchObject({ width: 480, height: 300 });
  });
});

describe('applyContentHeight (renderer-driven height)', () => {
  it('unpinned: clamps to [200, 60 % of the work area] and keeps the width', () => {
    const c = new DraftWindowController();
    c.applyContentHeight(50);
    expect(bounds()).toMatchObject({ width: 560, height: 200 });

    c.applyContentHeight(5000);
    expect(bounds()).toMatchObject({ width: 560, height: Math.round(1080 * 0.6) });
  });

  it('unpinned: the cap follows the display the window is on', () => {
    const c = new DraftWindowController();
    displays = [PRIMARY, SECONDARY];
    win._bounds = { x: 2000, y: 100, width: 560, height: 220 };
    c.applyContentHeight(5000);
    expect(bounds().height).toBe(Math.round(1440 * 0.6));
  });

  it('pinned: clamps to [180, 360]', () => {
    const c = new DraftWindowController();
    pinned(c);
    c.applyContentHeight(10);
    expect(bounds().height).toBe(180);
  });

  it('rounds a fractional height from the ResizeObserver', () => {
    const c = new DraftWindowController();
    c.applyContentHeight(300.6);
    expect(bounds().height).toBe(301);
  });

  it('is ignored while the user-chosen pin size is in force', () => {
    const c = new DraftWindowController();
    pinned(c);
    c.setPinSize({ width: 400, height: 300 });
    win.setBounds.mockClear();
    c.applyContentHeight(200);
    expect(win.setBounds).not.toHaveBeenCalled();
  });
});

describe('setPinSize (manual resize)', () => {
  it('enforces the pin bracket: at least 320 x 180, at most 45 % of the work area', () => {
    const c = new DraftWindowController();
    pinned(c);

    c.setPinSize({ width: 100, height: 50 });
    expect(bounds()).toMatchObject({ width: 320, height: 180 });

    c.setPinSize({ width: 5000, height: 5000 });
    expect(bounds()).toMatchObject({
      width: Math.round(1920 * 0.45),
      height: Math.round(1080 * 0.45),
    });
  });

  it('keeps the anchor corner pixel-fixed for every corner', () => {
    const c = new DraftWindowController();
    pinned(c);
    // Move the pin to the bottom-right first.
    pressHeader();
    dragTo(1500, 800);
    settle();
    expect(c.getCorner()).toBe('br');

    c.setPinSize({ width: 500, height: 300 });

    const b = bounds();
    expect(b.x + b.width).toBe(1920 - 24);
    expect(b.y + b.height).toBe(1080 - 24);
  });

  it('is ignored while a pin animation is still running', () => {
    const c = new DraftWindowController();
    c.applyPinState(true, 220); // not settled
    win.setBounds.mockClear();
    c.setPinSize({ width: 500, height: 300 });
    expect(win.setBounds).not.toHaveBeenCalled();
  });

  it('does not touch the window when the size already matches', () => {
    const c = new DraftWindowController();
    pinned(c);
    c.setPinSize({ width: 500, height: 300 });
    win.setBounds.mockClear();
    c.setPinSize({ width: 500, height: 300 });
    expect(win.setBounds).not.toHaveBeenCalled();
  });

  it('announces custom-size mode once, not on every resize', () => {
    const c = new DraftWindowController();
    pinned(c);
    c.setPinSize({ width: 500, height: 300 });
    c.setPinSize({ width: 520, height: 320 });
    c.setPinSize({ width: 540, height: 340 });
    expect(sentChannels().filter((ch) => ch === 'draft:customSizeChanged')).toHaveLength(1);
  });
});

describe('resetPinSize', () => {
  it('does nothing while unpinned', () => {
    const c = new DraftWindowController();
    c.resetPinSize();
    expect(win.setBounds).not.toHaveBeenCalled();
    expect(sentChannels()).not.toContain('draft:customSizeChanged');
  });

  it('is silent about custom-size mode when no custom size was set', () => {
    const c = new DraftWindowController();
    pinned(c);
    c.resetPinSize();
    expect(sentChannels()).not.toContain('draft:customSizeChanged');
  });

  it('lets the renderer resume driving the height afterwards', () => {
    const c = new DraftWindowController();
    pinned(c);
    c.setPinSize({ width: 480, height: 320 });
    c.resetPinSize();
    settle();
    win.setBounds.mockClear();

    c.applyContentHeight(300);

    expect(win.setBounds).toHaveBeenCalled();
  });

  it('shrinks back into the same corner the panel is pinned to', () => {
    const c = new DraftWindowController();
    pinned(c);
    pressHeader();
    dragTo(40, 700);
    settle();
    c.setPinSize({ width: 480, height: 320 });

    c.resetPinSize();

    expect(bounds()).toEqual({ x: 24, y: 1080 - 220 - 24, width: 320, height: 220 });
  });
});

describe('dragging the pinned panel by its header', () => {
  it('announces the drag start to the renderer exactly once per gesture', () => {
    const c = new DraftWindowController();
    pinned(c);
    pressHeader();
    pressHeader();
    expect(sentChannels().filter((ch) => ch === 'draft:dragStart')).toHaveLength(1);
  });

  it('snaps to the nearest corner on release and tells the renderer which one', () => {
    const c = new DraftWindowController();
    pinned(c);
    pressHeader();

    dragTo(100, 600); // centre in the bottom-left quadrant
    expect(win.setBounds.mock.calls.at(-1)![1]).toBe(true);
    expect(bounds()).toEqual({ x: 24, y: 1080 - 220 - 24, width: 320, height: 220 });
    expect(sendMock).toHaveBeenCalledWith('draft:cornerChanged', 'bl');
    expect(c.getCorner()).toBe('bl');
  });

  it.each([
    ['tl', 100, 50],
    ['tr', 1400, 50],
    ['bl', 100, 700],
    ['br', 1400, 700],
  ] as const)('a drop in the %s quadrant parks the panel there', (corner, x, y) => {
    const c = new DraftWindowController();
    pinned(c);
    pressHeader();
    dragTo(x, y);
    expect(c.getCorner()).toBe(corner);
  });

  it('released where it started: no snap, just a drag-end for the renderer', () => {
    const c = new DraftWindowController();
    pinned(c);
    pressHeader();
    win.setBounds.mockClear();

    handlers.mouseUp!();

    expect(win.setBounds).not.toHaveBeenCalled();
    expect(sentChannels()).toEqual(['draft:dragStart', 'draft:dragEnd']);
  });

  it('dropped slightly off but in the same corner: glides back without a corner change', () => {
    const c = new DraftWindowController();
    pinned(c);
    pressHeader();

    dragTo(bounds().x - 40, bounds().y + 30);

    expect(bounds()).toEqual({ x: 1920 - 320 - 24, y: 24, width: 320, height: 220 });
    expect(sentChannels()).not.toContain('draft:cornerChanged');
  });

  it('snaps onto the display it was dropped on (multi-display)', () => {
    const c = new DraftWindowController();
    displays = [PRIMARY, SECONDARY];
    pinned(c);
    pressHeader();

    dragTo(2000, 1000); // bottom-left of the second monitor

    expect(bounds()).toEqual({ x: 1920 + 24, y: 1440 - 220 - 24, width: 320, height: 220 });
    expect(c.getCorner()).toBe('bl');
  });

  it('ignores a second mouse-up after the gesture ended', () => {
    const c = new DraftWindowController();
    pinned(c);
    pressHeader();
    dragTo(100, 600);
    settle();
    win.setBounds.mockClear();
    handlers.mouseUp!();
    expect(win.setBounds).not.toHaveBeenCalled();
  });

  describe('a press that must not start a window drag', () => {
    const expectNoDrag = (): void => expect(sentChannels()).not.toContain('draft:dragStart');

    it('while the panel is not pinned (Spotlight-style, immovable)', () => {
      new DraftWindowController();
      cursor.x = 600;
      cursor.y = 420;
      win._bounds = { x: 500, y: 400, width: 560, height: 220 };
      handlers.mouseDown!();
      expectNoDrag();
    });

    it('while the pin animation is still running', () => {
      const c = new DraftWindowController();
      c.applyPinState(true, 220);
      sendMock.mockClear();
      pressHeader();
      expectNoDrag();
    });

    it('on the pin button', () => {
      const c = new DraftWindowController();
      pinned(c);
      const b = bounds();
      cursor.x = b.x + b.width - 20 - 16; // inside the 32 px button, 20 px from the edge
      cursor.y = b.y + 20;
      handlers.mouseDown!();
      expectNoDrag();
    });

    it('below the header strip (editor body)', () => {
      const c = new DraftWindowController();
      pinned(c);
      const b = bounds();
      cursor.x = b.x + 100;
      cursor.y = b.y + 100;
      handlers.mouseDown!();
      expectNoDrag();
    });

    it('outside the window', () => {
      const c = new DraftWindowController();
      pinned(c);
      cursor.x = 10;
      cursor.y = 10;
      handlers.mouseDown!();
      expectNoDrag();
    });

    it('in the top-right header corner when pinned to a bottom corner (pin button + resize handle)', () => {
      // Pinned bottom-left, the handle is in the TOP-right corner — inside the
      // header strip, where AppKit would otherwise start moving the window.
      const c = new DraftWindowController();
      pinned(c);
      pressHeader();
      dragTo(100, 700);
      settle();
      expect(c.getCorner()).toBe('bl');
      sendMock.mockClear();
      const b = bounds();
      cursor.x = b.x + b.width - 5;
      cursor.y = b.y + 5;
      handlers.mouseDown!();
      expectNoDrag();
    });

    it('on the resize handle in the top-left header corner (panel pinned bottom-right)', () => {
      const c = new DraftWindowController();
      pinned(c);
      pressHeader();
      dragTo(1500, 700);
      settle();
      expect(c.getCorner()).toBe('br');
      sendMock.mockClear();
      const b = bounds();
      cursor.x = b.x + 5;
      cursor.y = b.y + 5;
      handlers.mouseDown!();
      expectNoDrag();
    });

    it('while a corner-handle resize owns the cursor', () => {
      const c = new DraftWindowController();
      pinned(c);
      c.beginResize();
      pressHeader();
      expectNoDrag();
    });
  });
});

describe('resizing the pinned panel from its corner handle', () => {
  /** Pin top-right, settle, grab the handle (the bottom-left corner). */
  function startResize(): DraftWindowControllerCtor {
    const c = new DraftWindowController();
    pinned(c);
    cursor.x = 1000;
    cursor.y = 500;
    c.beginResize();
    return c;
  }

  it('drags the free corner while the anchor corner never moves', () => {
    startResize();
    cursor.x = 950; // 50 px left  -> wider (handle is on the left)
    cursor.y = 540; // 40 px down  -> taller (handle is at the bottom)
    handlers.mouseDrag!();

    const b = bounds();
    expect(b).toMatchObject({ width: 370, height: 260 });
    expect(b.x + b.width).toBe(1920 - 24);
    expect(b.y).toBe(24);
    expect(win.setBounds.mock.calls.at(-1)![1]).toBe(false);
  });

  it('never grows past the pin bracket however far the cursor travels', () => {
    startResize();
    cursor.x = -4000;
    cursor.y = 4000;
    handlers.mouseDrag!();
    expect(bounds()).toMatchObject({
      width: Math.round(1920 * 0.45),
      height: Math.round(1080 * 0.45),
    });
  });

  it('shrinking below the minimum stops at 320 x 180', () => {
    startResize();
    cursor.x = 4000;
    cursor.y = -4000;
    handlers.mouseDrag!();
    expect(bounds()).toMatchObject({ width: 320, height: 180 });
  });

  it('works from a bottom-right pin too (handle in the top-left corner)', () => {
    const c = new DraftWindowController();
    pinned(c);
    pressHeader();
    dragTo(1500, 700);
    settle();
    cursor.x = 1000;
    cursor.y = 500;
    c.beginResize();

    cursor.x = 960; // left -> wider
    cursor.y = 470; // up   -> taller
    handlers.mouseDrag!();

    const b = bounds();
    expect(b).toMatchObject({ width: 360, height: 250 });
    expect(b.x + b.width).toBe(1920 - 24);
    expect(b.y + b.height).toBe(1080 - 24);
  });

  it('flags custom-size mode while resizing', () => {
    startResize();
    cursor.x = 950;
    handlers.mouseDrag!();
    expect(sendMock).toHaveBeenCalledWith('draft:customSizeChanged', true);
  });

  it('release ends the gesture: window is movable again and the cursor no longer resizes it', () => {
    startResize();
    win.setMovable.mockClear();

    handlers.mouseUp!();

    expect(win.setMovable).toHaveBeenLastCalledWith(true);
    const before = bounds();
    cursor.x = 700;
    handlers.mouseDrag!();
    expect(bounds()).toEqual(before);
  });

  it('release after a resize does not snap or announce a drag end', () => {
    startResize();
    cursor.x = 950;
    handlers.mouseDrag!();
    sendMock.mockClear();

    handlers.mouseUp!();

    expect(sentChannels()).toEqual([]);
  });

  it('ignores cursor movement when no resize was started', () => {
    const c = new DraftWindowController();
    pinned(c);
    cursor.x = 100;
    win.setBounds.mockClear();
    handlers.mouseDrag!();
    expect(win.setBounds).not.toHaveBeenCalled();
    expect(c.getCorner()).toBe('tr');
  });

  it('cannot start while unpinned or while the pin animation runs', () => {
    const c = new DraftWindowController();
    c.beginResize();
    c.applyPinState(true, 220); // animating
    c.beginResize();
    cursor.x = 900;
    win.setBounds.mockClear();
    handlers.mouseDrag!();
    expect(win.setBounds).not.toHaveBeenCalled();
  });
});

describe('header hover', () => {
  it('is forwarded to the renderer while pinned', () => {
    const c = new DraftWindowController();
    pinned(c);
    handlers.hover!(true);
    expect(sendMock).toHaveBeenCalledWith('draft:headerHover', true);
    handlers.hover!(false);
    expect(sendMock).toHaveBeenCalledWith('draft:headerHover', false);
  });

  it('is swallowed while unpinned', () => {
    new DraftWindowController();
    handlers.hover!(true);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
