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
 */
export function DraftHeader({
  pinned,
  onTogglePin,
  onResetPinSize,
}: DraftHeaderProps): JSX.Element {
  return (
    <div className={`${pinned ? 'draft-drag' : ''} flex items-center h-[60px] px-5`}>
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
        className={`draft-no-drag ${pinned ? 'ml-2' : 'ml-auto'} w-8 h-8 rounded-icon flex items-center justify-center transition-colors ${
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
