import { describe, expect, it } from 'vitest';

import {
  PIN_INSET,
  PIN_WIDTH,
  clampPinSize,
  cornerBounds,
  cornerForBounds,
  oppositeCorner,
  pinSizeLimits,
} from '../../windows/draft-geometry';

import type { Bounds, Corner } from '../../windows/draft-types';
import type { Display } from 'electron';

function display(workArea: { x: number; y: number; width: number; height: number }): Display {
  // Only fields the geometry helpers touch — geometry never inspects bounds,
  // scaleFactor, rotation, etc.
  return { workArea } as unknown as Display;
}

describe('oppositeCorner', () => {
  it.each<[Corner, Corner]>([
    ['tr', 'bl'],
    ['tl', 'br'],
    ['br', 'tl'],
    ['bl', 'tr'],
  ])('opposite of %s is %s', (input, expected) => {
    expect(oppositeCorner(input)).toBe(expected);
  });
});

describe('pinSizeLimits', () => {
  it('caps max dimensions at 45% of the work area', () => {
    const d = display({ x: 0, y: 0, width: 2000, height: 1000 });
    const limits = pinSizeLimits(d);
    expect(limits.minW).toBe(PIN_WIDTH);
    expect(limits.minH).toBe(180);
    expect(limits.maxW).toBe(900);
    expect(limits.maxH).toBe(450);
  });
});

describe('clampPinSize', () => {
  const d = display({ x: 0, y: 0, width: 2000, height: 1000 });

  it('rounds and clamps within [min, max]', () => {
    const small = clampPinSize(d, { width: 100, height: 50 });
    expect(small).toEqual({ width: PIN_WIDTH, height: 180 });

    const huge = clampPinSize(d, { width: 9999, height: 9999 });
    expect(huge).toEqual({ width: 900, height: 450 });

    const mid = clampPinSize(d, { width: 400.6, height: 300.4 });
    expect(mid).toEqual({ width: 401, height: 300 });
  });
});

describe('cornerBounds', () => {
  const d = display({ x: 100, y: 50, width: 1000, height: 800 });
  const size = { width: 320, height: 220 };

  it.each<[Corner, Bounds]>([
    ['tl', { x: 100 + PIN_INSET, y: 50 + PIN_INSET, width: 320, height: 220 }],
    ['tr', { x: 100 + 1000 - 320 - PIN_INSET, y: 50 + PIN_INSET, width: 320, height: 220 }],
    ['bl', { x: 100 + PIN_INSET, y: 50 + 800 - 220 - PIN_INSET, width: 320, height: 220 }],
    ['br', {
      x: 100 + 1000 - 320 - PIN_INSET,
      y: 50 + 800 - 220 - PIN_INSET,
      width: 320,
      height: 220,
    }],
  ])('places %s correctly', (corner, expected) => {
    expect(cornerBounds(d, corner, size)).toEqual(expected);
  });
});

describe('cornerForBounds', () => {
  const d = display({ x: 0, y: 0, width: 1000, height: 800 });

  it.each<[Corner, { x: number; y: number }]>([
    ['tl', { x: 50, y: 50 }],
    ['tr', { x: 900, y: 50 }],
    ['bl', { x: 50, y: 700 }],
    ['br', { x: 900, y: 700 }],
  ])('snaps a %s-quadrant rect to %s', (expected, pos) => {
    const bounds: Bounds = { x: pos.x, y: pos.y, width: 60, height: 60 };
    expect(cornerForBounds(bounds, d)).toBe(expected);
  });

  it('treats the midpoint as bottom-right (boundary inclusive on both axes)', () => {
    // Window center exactly at display midpoint.
    const bounds: Bounds = { x: 500 - 50, y: 400 - 50, width: 100, height: 100 };
    expect(cornerForBounds(bounds, d)).toBe('br');
  });
});
