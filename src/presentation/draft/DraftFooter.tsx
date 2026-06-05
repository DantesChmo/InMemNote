/**
 * Footer with the markdown label and keyboard hints.
 *
 * Pin-mode hides the footer entirely (see `DraftPanel`), so we don't try to
 * shrink it here — it's the full-size case only.
 */
export function DraftFooter(): JSX.Element {
  return (
    <div className="flex items-center h-[46px] px-5 border-t border-line text-[12px] text-text-3">
      <span>Markdown</span>
      <span className="ml-auto flex items-center gap-2">
        <Kbd>esc</Kbd>
        <span className="text-text-3">·</span>
        <Kbd>⌘ ↵</Kbd>
      </span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="font-mono text-[11px] text-text-2 border border-line rounded-[5px] px-[6px] py-[2px] leading-none">
      {children}
    </span>
  );
}
