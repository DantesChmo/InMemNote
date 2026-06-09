import type { Bounds, Corner } from './draft-types';
import type { Display } from 'electron';

/**
 * Pure geometry helpers for the Draft window. No Electron BrowserWindow
 * inside — every function takes plain data and returns plain data, so the
 * whole module is unit-testable without launching the app.
 *
 * Constants here mirror values in the renderer's CSS (`design/`). Whenever
 * a value changes in one place it must be updated in the other.
 */

// --- Mode widths/heights (design spec: design/Inmemnote - Draft (hi-fi).html) ---

/** Unpinned Draft panel: fixed width, Spotlight-style. */
export const DRAFT_DEFAULT_WIDTH = 560;

/** Pinned Draft panel: fixed default width before user resize. */
export const PIN_WIDTH = 320;

/** Distance from the work area edge to the pinned panel in any corner. */
export const PIN_INSET = 24;

/** Initial height of a freshly pinned panel before the renderer settles. */
export const PIN_DEFAULT_HEIGHT = 220;

// --- Header / button / resize-handle geometry, mirrored from the renderer ---

export const HEADER_HEIGHT = 60;
export const PIN_BUTTON_RIGHT_INSET = 20;
export const PIN_BUTTON_WIDTH = 32;
export const RESIZE_HANDLE_SIZE = 18;

/**
 * The corner diagonally opposite of `corner`. Used for placing the resize
 * handle, which lives on the opposite corner from the pin anchor.
 */
export function oppositeCorner(corner: Corner): Corner {
  switch (corner) {
    case 'tr':
      return 'bl';
    case 'tl':
      return 'br';
    case 'br':
      return 'tl';
    case 'bl':
      return 'tr';
  }
}

/**
 * Max pin dimensions: 45 % of the work area along each axis. Caps the
 * resize so the panel can't sprawl across most of the screen — a "pin"
 * is meant to stay small.
 */
export function pinSizeLimits(display: Display): {
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
} {
  const wa = display.workArea;
  return {
    minW: PIN_WIDTH,
    maxW: Math.round(wa.width * 0.45),
    minH: 180,
    maxH: Math.round(wa.height * 0.45),
  };
}

export function clampPinSize(
  display: Display,
  size: { width: number; height: number },
): { width: number; height: number } {
  const { minW, maxW, minH, maxH } = pinSizeLimits(display);
  return {
    width: Math.max(minW, Math.min(Math.round(size.width), maxW)),
    height: Math.max(minH, Math.min(Math.round(size.height), maxH)),
  };
}

/**
 * Place a rectangle of `size` flush into `corner` of `display.workArea`,
 * leaving `PIN_INSET` from both edges that the corner touches.
 */
export function cornerBounds(
  display: Display,
  corner: Corner,
  size: { width: number; height: number },
): Bounds {
  const wa = display.workArea;
  return {
    x:
      corner === 'tr' || corner === 'br'
        ? wa.x + wa.width - size.width - PIN_INSET
        : wa.x + PIN_INSET,
    y:
      corner === 'bl' || corner === 'br'
        ? wa.y + wa.height - size.height - PIN_INSET
        : wa.y + PIN_INSET,
    width: size.width,
    height: size.height,
  };
}

/**
 * Decide which corner the window center is closest to. Splits the display
 * work area into four equal quadrants; the corner whose quadrant contains
 * the window center wins.
 */
export function cornerForBounds(bounds: Bounds, display: Display): Corner {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const dispMidX = display.workArea.x + display.workArea.width / 2;
  const dispMidY = display.workArea.y + display.workArea.height / 2;
  const right = centerX >= dispMidX;
  const bottom = centerY >= dispMidY;
  if (right && bottom) return 'br';
  if (right && !bottom) return 'tr';
  if (!right && bottom) return 'bl';
  return 'tl';
}
