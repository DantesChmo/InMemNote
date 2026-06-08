import { useCallback } from 'react';

type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface ResizeHandleProps {
  /** The corner the pin is currently anchored to. The handle is placed on the diagonally OPPOSITE corner. */
  pinnedCorner: Corner;
}

/**
 * Invisible 18×18 px hit area in the corner diagonally opposite the pin's
 * anchor. Carries the OS-standard `nwse-resize` / `nesw-resize` cursor so
 * the user gets the "you can resize here" affordance without us drawing
 * anything visible.
 *
 * All the actual drag tracking happens in the main process via the AppKit
 * native addon (`subscribeToMouseDrag`) — we don't put any DOM `mousemove`
 * listener in the renderer because AppKit's drag region can swallow
 * events and a global cursor stream is more reliable anyway. This handler
 * only fires the IPC that tells main "begin resize"; main does the rest
 * (read cursor, recompute bounds, `setBounds`) until the matching
 * `LeftMouseUp` lands.
 */
export function ResizeHandle({ pinnedCorner }: ResizeHandleProps): JSX.Element {
  const opposite = OPPOSITE[pinnedCorner];

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    void window.inmemnote.draft.beginResize();
  }, []);

  return (
    <div
      data-testid="draft-resize-handle"
      onMouseDown={onMouseDown}
      // `draft-no-drag` opts out of the header's `-webkit-app-region: drag`.
      // Without it, when the pin sits in a bottom corner the handle lands
      // inside the top-edge header strip; AppKit's drag region swallows the
      // mousedown before any DOM listener runs (z-index is irrelevant to
      // drag-region hit-testing), so the user sees a window drag instead of
      // a resize.
      className="draft-no-drag"
      style={{
        position: 'absolute',
        ...positionFor(opposite),
        width: 18,
        height: 18,
        cursor: cursorFor(opposite),
        opacity: 0,
        // Above the blur overlay so it stays interactive while a drag is
        // visually muted by the overlay.
        zIndex: 100,
      }}
    />
  );
}

const OPPOSITE: Record<Corner, Corner> = {
  tr: 'bl',
  tl: 'br',
  br: 'tl',
  bl: 'tr',
};

function cursorFor(corner: Corner): string {
  return corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize';
}

function positionFor(corner: Corner): {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
} {
  switch (corner) {
    case 'tl':
      return { top: 0, left: 0 };
    case 'tr':
      return { top: 0, right: 0 };
    case 'bl':
      return { bottom: 0, left: 0 };
    case 'br':
      return { bottom: 0, right: 0 };
  }
}
