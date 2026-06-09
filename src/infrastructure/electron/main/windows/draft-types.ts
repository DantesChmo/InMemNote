/**
 * Shared geometry/animation types used across the Draft window controller,
 * its pure geometry helpers, and the IPC layer.
 */

/** The four corner slots the pinned Draft overlay can occupy. */
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutOpts {
  /** When `true`, the move/resize is animated using AppKit's native curve. */
  animate: boolean;
  /**
   * Final window height, in CSS px, that the renderer has predicted from
   * the post-toggle layout. Honoring it as the exact animation target makes
   * the window animate ONCE — without it, main would animate to a guessed
   * value and immediately re-snap to the real content height, which the
   * user sees as a two-step jump.
   */
  targetHeight?: number;
}
