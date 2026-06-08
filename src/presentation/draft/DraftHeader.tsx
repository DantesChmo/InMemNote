import { useEffect, useState } from 'react';

interface DraftHeaderProps {
  pinned: boolean;
  onTogglePin: () => void;
  onResetPinSize?: () => void;
}

/**
 * Header strip — icon, title, optional reset button (pinned mode only),
 * pin toggle.
 *
 * In pinned mode the strip is a window drag region (`-webkit-app-region: drag`)
 * so AppKit can carry the window with the cursor. In un-pinned mode there is
 * NO drag region: the overlay should behave like Spotlight / Raycast — fixed
 * at the cursor display's center, immovable. We pair this with
 * `setMovable(false)` on the BrowserWindow in main.
 *
 * Both buttons opt out of the drag region via `draft-no-drag` so clicks on
 * them never get swallowed by AppKit's drag handling.
 *
 * Hover affordance: CSS `:hover` never fires on a `-webkit-app-region: drag`
 * element — AppKit takes the area over before Chromium can match the
 * pseudoclass. So we get the hover signal from main, where a native
 * `NSTrackingArea` watches the top strip of the window's content view and
 * emits enter/exit callbacks (only on boundary crossings, so the idle path
 * is free of event traffic).
 */
export function DraftHeader({
  pinned,
  onTogglePin,
  onResetPinSize,
}: DraftHeaderProps): JSX.Element {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    return window.inmemnote.draft.onHeaderHover(setHovered);
  }, []);

  // Main only emits hover events while pinned, but the user could un-pin
  // while their cursor was over the header — without an explicit reset the
  // last `entered=true` we received would visually stick.
  useEffect(() => {
    if (!pinned) setHovered(false);
  }, [pinned]);

  return (
    <div
      className={`${pinned ? 'draft-drag' : ''} flex items-center h-[60px] px-5 transition-colors`}
      style={{
        ...(pinned ? { cursor: 'grab' } : undefined),
        // Subtle hover tint — uses `--text` mixed at 4 % so the same value
        // reads correctly in both dark and light themes.
        ...(pinned && hovered
          ? { background: 'color-mix(in oklch, var(--text) 4%, transparent)' }
          : undefined),
      }}
    >
      <div className="w-7 h-7 rounded-icon bg-accent text-accent-ink flex items-center justify-center text-[15px] leading-none">
        ⚡
      </div>
      <div className="ml-3 text-[15px] font-semibold">Быстрая заметка</div>
      {pinned && onResetPinSize && (
        <button
          type="button"
          onClick={onResetPinSize}
          aria-label="Reset pin size"
          data-testid="draft-reset-size-btn"
          className="draft-no-drag ml-auto w-8 h-8 rounded-icon flex items-center justify-center text-text-3 hover:bg-[var(--hl)] hover:text-text-2 transition-colors"
          title="Сбросить размер"
        >
          <svg
            viewBox="0 0 16 16"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8a5 5 0 1 0 1.6-3.6" />
            <path d="M3 3v3h3" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={onTogglePin}
        aria-label={pinned ? 'Открепить' : 'Закрепить'}
        data-testid="draft-pin-btn"
        className={`draft-no-drag ${pinned && onResetPinSize ? 'ml-2' : 'ml-auto'} w-8 h-8 rounded-icon flex items-center justify-center transition-colors ${
          pinned
            ? 'bg-accent text-accent-ink'
            : 'text-text-3 hover:bg-[var(--hl)] hover:text-text-2'
        }`}
        title="Закрепить поверх окон"
      >
        <svg
          viewBox="0 0 16 16"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 1.5h4M7 1.5l-.4 4.2L4.5 8h7L9.4 5.7 9 1.5M8 8v6.5" />
        </svg>
      </button>
    </div>
  );
}
