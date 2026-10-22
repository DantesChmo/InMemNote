import { describe, expect, it } from 'vitest';

import { CHANNEL_GROUPS, IPC } from './channels';

const groups = Object.values(CHANNEL_GROUPS);
const keys = groups.flatMap((g) => Object.keys(g));
const values = groups.flatMap((g) => Object.values(g) as string[]);

describe('IPC channel map', () => {
  it('has no key defined by two context maps (a spread would silently drop one)', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no channel name shared by two keys', () => {
    expect(new Set(values).size).toBe(values.length);
  });

  it('contains every channel of every context map', () => {
    expect(Object.keys(IPC)).toHaveLength(keys.length);
  });

  it('names every channel `<noun>:<verb>`', () => {
    for (const v of values) expect(v).toMatch(/^[_a-z]+:[A-Za-z]+$/);
  });
});
