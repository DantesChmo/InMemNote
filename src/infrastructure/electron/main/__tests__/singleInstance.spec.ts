import { describe, expect, it, vi, type Mock } from 'vitest';

import { claimSingleInstance, type SingleInstanceApp } from '../singleInstance';

function makeApp(opts: { gotLock: boolean; ready?: boolean }): SingleInstanceApp & {
  emitSecondInstance: () => void;
  quit: Mock<SingleInstanceApp['quit']>;
  on: Mock<SingleInstanceApp['on']>;
} {
  const listeners: Array<() => void> = [];
  return {
    requestSingleInstanceLock: vi.fn(() => opts.gotLock),
    isReady: vi.fn(() => opts.ready ?? true),
    quit: vi.fn<SingleInstanceApp['quit']>(),
    on: vi.fn<SingleInstanceApp['on']>((_event, listener) => {
      listeners.push(listener);
    }),
    emitSecondInstance: () => listeners.forEach((l) => l()),
  };
}

describe('claimSingleInstance', () => {
  it('lets the first instance boot and does not quit it', () => {
    const app = makeApp({ gotLock: true });
    expect(claimSingleInstance(app, vi.fn())).toBe(true);
    expect(app.quit).not.toHaveBeenCalled();
  });

  it('quits a second instance and tells the caller to skip initialisation', () => {
    const app = makeApp({ gotLock: false });
    const onSecondInstance = vi.fn();
    expect(claimSingleInstance(app, onSecondInstance)).toBe(false);
    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(app.on).not.toHaveBeenCalled();
  });

  it('runs the callback in the first instance when another launch is attempted', () => {
    const app = makeApp({ gotLock: true });
    const onSecondInstance = vi.fn();
    claimSingleInstance(app, onSecondInstance);
    expect(app.on).toHaveBeenCalledWith('second-instance', expect.any(Function));
    app.emitSecondInstance();
    expect(onSecondInstance).toHaveBeenCalledTimes(1);
  });

  it('ignores a second launch that arrives before the app is ready', () => {
    const app = makeApp({ gotLock: true, ready: false });
    const onSecondInstance = vi.fn();
    claimSingleInstance(app, onSecondInstance);
    app.emitSecondInstance();
    expect(onSecondInstance).not.toHaveBeenCalled();
  });
});
