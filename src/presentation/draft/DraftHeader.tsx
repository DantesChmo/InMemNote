interface DraftHeaderProps {
  pinned: boolean;
  onTogglePin: () => void;
}

/**
 * Header strip — icon, title, pin toggle.
 *
 * Whole strip is a window drag region (`-webkit-app-region: drag`) except the
 * pin button, which opts back out via `draft-no-drag`. That way the user can
 * grab the panel anywhere on the header without "accidentally pinning".
 */
export function DraftHeader({ pinned, onTogglePin }: DraftHeaderProps): JSX.Element {
  return (
    <div className="draft-drag flex items-center h-[60px] px-5">
      <div className="w-7 h-7 rounded-icon bg-accent text-accent-ink flex items-center justify-center text-[15px] leading-none">
        ⚡
      </div>
      <div className="ml-3 text-[15px] font-semibold">Быстрая заметка</div>
      <button
        type="button"
        onClick={onTogglePin}
        className={`draft-no-drag ml-auto w-8 h-8 rounded-icon flex items-center justify-center transition-colors ${
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
