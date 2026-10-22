import { useAppDispatch, useAppSelector } from '@presentation/app/store';
import { useTranslation } from '@presentation/i18n/useTranslation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { commitDelete, undoDelete } from './slice';

/** How long a deleted note can be taken back. */
export const UNDO_DELETE_MS = 6000;

/** After a hover/focus pause the user still gets at least this long. */
const MIN_RESUME_MS = 2000;

/**
 * Undo toast for a soft-deleted note (Library).
 *
 * The slice only hides a deleted note; this component decides when the
 * deletion becomes permanent: when the timer runs out, on "×", on window
 * unload, or — via the slice — when another note is deleted. Hovering or
 * focusing the toast pauses the timer so reaching for "Undo" never races it.
 *
 * ⌘Z undoes too, but only when focus is outside text fields: inside the
 * editor CodeMirror owns ⌘Z for its own history.
 *
 * The `role="status"` region stays mounted while empty so screen readers
 * announce the toast reliably when its content appears.
 */
export function UndoDeleteToast(): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const pendingId = useAppSelector((s) => s.library.pendingDelete?.note.id ?? null);

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  // Time left on the current note's window; reset whenever a new delete
  // takes the slot.
  const remaining = useRef(UNDO_DELETE_MS);
  const startedAt = useRef(0);
  useEffect(() => {
    remaining.current = UNDO_DELETE_MS;
  }, [pendingId]);

  useEffect(() => {
    if (pendingId === null || paused) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(
      () => void dispatch(commitDelete(pendingId)),
      remaining.current,
    );
    return () => {
      window.clearTimeout(timer);
      const left = remaining.current - (Date.now() - startedAt.current);
      remaining.current = Math.max(left, MIN_RESUME_MS);
    };
  }, [dispatch, pendingId, paused]);

  const commitNow = useCallback(() => {
    if (pendingId !== null) void dispatch(commitDelete(pendingId));
  }, [dispatch, pendingId]);

  const undo = useCallback(() => void dispatch(undoDelete()), [dispatch]);

  // Quitting or closing the window must not leave the note half-deleted:
  // the user saw it go, so it goes (see LibraryEditor for why IPC still
  // lands during `beforeunload`).
  useEffect(() => {
    if (pendingId === null) return;
    window.addEventListener('beforeunload', commitNow);
    return () => window.removeEventListener('beforeunload', commitNow);
  }, [pendingId, commitNow]);

  useEffect(() => {
    if (pendingId === null) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!e.metaKey || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      if (isTextTarget(e.target)) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingId, undo]);

  // A replaced or finished toast must not inherit the previous pause.
  useEffect(() => {
    setHovered(false);
    setFocused(false);
  }, [pendingId]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="absolute left-[224px] bottom-4 w-[264px] z-10"
    >
      {pendingId !== null && (
        <div
          data-testid="lib-undo-toast"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex items-center gap-2 h-10 pl-3 pr-1 rounded-pill bg-bar border border-[var(--bar-line)] shadow-pin font-ui animate-toast-in motion-reduce:animate-none"
        >
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0 text-text-3"
          >
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8L11 4.5" />
          </svg>
          <span className="flex-1 truncate text-[13px] text-text">
            {t('library.toast.noteDeleted')}
          </span>
          <button
            type="button"
            onClick={undo}
            aria-label={t('library.toast.undoAria')}
            aria-keyshortcuts="Meta+Z"
            data-testid="lib-undo-btn"
            className="h-8 px-3 rounded-icon bg-accent text-accent-ink text-[12px] font-semibold hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            {t('library.toast.undo')}
          </button>
          <button
            type="button"
            onClick={commitNow}
            aria-label={t('library.toast.dismiss')}
            data-testid="lib-undo-dismiss"
            className="w-8 h-8 rounded-icon flex items-center justify-center text-text-3 transition-colors hover:bg-[var(--hl)] hover:text-text-2"
          >
            <svg
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('.cm-editor, input, textarea, [contenteditable="true"]') !== null;
}
