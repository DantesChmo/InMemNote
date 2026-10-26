import { describe, expect, it, vi } from 'vitest';

import { StorageHealthMonitor } from './StorageHealthMonitor';

describe('StorageHealthMonitor', () => {
  it('starts healthy', () => {
    expect(new StorageHealthMonitor().degraded).toEqual([]);
  });

  it('records degraded stores in order, with the error message as the reason', () => {
    const health = new StorageHealthMonitor();

    health.markDegraded('notes', new Error('database or disk is full'));
    health.markDegraded('drafts', new Error('SQLITE_CANTOPEN'));

    expect(health.degraded).toEqual([
      { store: 'notes', reason: 'database or disk is full' },
      { store: 'drafts', reason: 'SQLITE_CANTOPEN' },
    ]);
  });

  it('stringifies a non-Error throw into the reason', () => {
    const health = new StorageHealthMonitor();
    // Native bindings occasionally throw plain strings.
    health.markDegraded('settings', 'dlopen failed');
    expect(health.degraded).toEqual([{ store: 'settings', reason: 'dlopen failed' }]);
  });

  it('keeps the first reason when the same store fails again', () => {
    const health = new StorageHealthMonitor();

    health.markDegraded('notes', new Error('first'));
    health.markDegraded('notes', new Error('second'));

    expect(health.degraded).toEqual([{ store: 'notes', reason: 'first' }]);
  });

  it('notifies listeners once per newly degraded store', () => {
    const health = new StorageHealthMonitor();
    const listener = vi.fn();
    health.onChange(listener);

    health.markDegraded('notes', new Error('full'));
    health.markDegraded('notes', new Error('full again'));
    health.markDegraded('drafts', new Error('full'));

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('lets a listener read the updated snapshot', () => {
    const health = new StorageHealthMonitor();
    let seen: unknown;
    health.onChange(() => (seen = health.degraded));

    health.markDegraded('drafts', new Error('gone'));

    expect(seen).toEqual([{ store: 'drafts', reason: 'gone' }]);
  });

  it('stops notifying after unsubscribe', () => {
    const health = new StorageHealthMonitor();
    const listener = vi.fn();
    const off = health.onChange(listener);

    off();
    health.markDegraded('notes', new Error('full'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('hands out a snapshot that later degradations do not mutate', () => {
    const health = new StorageHealthMonitor();
    const before = health.degraded;

    health.markDegraded('notes', new Error('full'));

    expect(before).toEqual([]);
  });
});
