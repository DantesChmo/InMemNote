import { useAppDispatch, useAppSelector } from '@presentation/app/store';
import { useEffect, useRef } from 'react';


import { createNote, fetchNotes, libraryActions } from './slice';

/**
 * Title bar of the Library window.
 *
 * On macOS `titleBarStyle: 'hiddenInset'` keeps the traffic lights but hides
 * the bar, so the area under them is ours. We make the whole toolbar a window
 * drag region except interactive controls (search input, buttons).
 */
export function LibraryToolbar(): JSX.Element {
  const dispatch = useAppDispatch();
  const query = useAppSelector((s) => s.library.query);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void dispatch(createNote());
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        e.preventDefault();
        dispatch(libraryActions.setQuery(''));
        void dispatch(fetchNotes());
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  return (
    <div
      className="lib-drag flex items-center gap-3 h-[52px] px-4 pl-[88px] bg-[var(--panel-2)] border-b border-line"
      aria-label="Library toolbar"
    >
      <label className="lib-no-drag flex items-center gap-2 h-8 px-3 bg-[var(--sink)] border border-line rounded-icon flex-1 max-w-[380px] focus-within:border-accent focus-within:bg-panel">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="text-text-3">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M11 11l3 3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          spellCheck={false}
          value={query}
          placeholder="Поиск по заметкам…"
          onChange={(e) => {
            dispatch(libraryActions.setQuery(e.target.value));
            void dispatch(fetchNotes());
          }}
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-text placeholder:text-text-3"
          aria-label="Search"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              dispatch(libraryActions.setQuery(''));
              void dispatch(fetchNotes());
              inputRef.current?.focus();
            }}
            className="text-text-3 text-[14px] leading-none px-1"
            aria-label="Clear search"
          >
            ✕
          </button>
        ) : (
          <span className="font-mono text-[10px] text-text-3 border border-line rounded-[4px] px-[5px] py-[1px]">
            ⌘F
          </span>
        )}
      </label>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => void dispatch(createNote())}
        className="lib-no-drag flex items-center gap-2 h-8 px-3 bg-accent border border-accent rounded-icon text-accent-ink text-[13px] hover:brightness-110"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
        Новая
        <span className="font-mono text-[10px] opacity-70">⌘N</span>
      </button>
    </div>
  );
}
