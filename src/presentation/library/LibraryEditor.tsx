
import { useAppDispatch, useAppSelector } from '@presentation/app/store';
import { CodeMirrorEditor } from '@presentation/draft/editor/CodeMirrorEditor';
import { useTranslation, type Translator } from '@presentation/i18n/useTranslation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { deleteNote, libraryActions, saveNote, toggleNotePin } from './slice';

/**
 * Right column: full-text editor for the selected note.
 *
 * Mirrors the Draft editor's keymap (⌘↵ for save-and-blur, autosave debounce)
 * but lives in a roomier layout — comfortable max-width, generous padding,
 * meta row at the top, word count footer at the bottom.
 *
 * When no note is selected we render the empty state so the user is never
 * looking at a black hole in the middle of the app.
 */
export function LibraryEditor(): JSX.Element {
  const dispatch = useAppDispatch();
  const { notes, selectedId } = useAppSelector((s) => s.library);
  const note = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);
  const { t } = useTranslation();

  const saveTimer = useRef<number | null>(null);

  const flushSave = useCallback(
    (id: string, content: string) => {
      void dispatch(saveNote({ id, content }));
    },
    [dispatch],
  );

  const onChange = useCallback(
    (next: string) => {
      if (!note) return;
      dispatch(libraryActions.patchSelectedContent(next));
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => flushSave(note.id, next), 500);
    },
    [dispatch, note, flushSave],
  );

  const onSubmit = useCallback(() => {
    if (!note) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    flushSave(note.id, note.content);
  }, [flushSave, note]);

  // Cancel any pending debounce when the user switches notes, so a save for
  // the previous note doesn't land on the freshly-selected one.
  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    };
  }, [selectedId]);

  if (!note) {
    return (
      <section className="flex-1 flex flex-col items-center justify-center gap-3.5 text-center text-text-3 px-10">
        <div className="w-[54px] h-[54px] rounded-[14px] bg-[var(--sink)] border border-line flex items-center justify-center">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3h9l5 5v13H5z" />
            <path d="M14 3v5h5" />
            <path d="M8.5 13h7M8.5 16.5h5" />
          </svg>
        </div>
        <div className="text-[14px] text-text-2">{t('editor.empty.title')}</div>
        <div className="text-[12.5px] max-w-[240px] leading-[1.5]">
          {t('editor.empty.hint')}
        </div>
      </section>
    );
  }

  const wordCount = note.content.replace(/[#>*_`\-]/g, ' ').split(/\s+/).filter(Boolean).length;

  return (
    <section className="flex-1 flex flex-col min-h-0 bg-panel">
      <div className="flex items-center gap-3 h-[46px] px-[18px] border-b border-[var(--line-2)] text-[11.5px] text-text-3">
        <span className={`flex items-center gap-1.5 ${note.pinned ? 'text-accent' : ''}`}>
          {note.pinned ? t('editor.pinned') : t('editor.notPinned')}
        </span>
        <span className="opacity-50">·</span>
        <span>{t('editor.modified')} <RelativeUpdated iso={note.updatedAt} t={t} /></span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => void dispatch(toggleNotePin(note.id))}
            aria-label={t('editor.pinAria')}
            data-testid="lib-pin-btn"
            className={`w-[30px] h-[30px] rounded-icon flex items-center justify-center transition-colors ${
              note.pinned ? 'bg-accent text-accent-ink' : 'text-text-3 hover:bg-[var(--hl)] hover:text-text-2'
            }`}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 1.5h4M7 1.5l-.4 4.2L4.5 8h7L9.4 5.7 9 1.5M8 8v6.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => void dispatch(deleteNote(note.id))}
            aria-label={t('editor.deleteAria')}
            data-testid="lib-delete-btn"
            className="w-[30px] h-[30px] rounded-icon flex items-center justify-center text-text-3 transition-colors hover:bg-[color-mix(in_oklch,#ec6a5e_22%,transparent)] hover:text-[#ec6a5e]"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8L11 4.5" />
            </svg>
          </button>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] mx-auto px-10 pt-[26px] pb-[60px]">
          {/* `key` forces CodeMirror to remount on note switch so its internal
              undo history doesn't bleed between notes. */}
          <CodeMirrorEditor
            key={note.id}
            value={note.content}
            placeholder={t('editor.placeholder')}
            onChange={onChange}
            onSubmit={onSubmit}
            autoFocus
          />
        </div>
      </div>
      <div className="flex items-center h-10 px-[18px] border-t border-[var(--line-2)] text-[11.5px] text-text-3">
        <span>{t('editor.wordCount', { n: wordCount })}</span>
        <span className="ml-auto flex items-center gap-2">
          <span>{t('editor.markdownHint')}</span>
          <span>·</span>
          <Kbd>⌘ ↵</Kbd>
        </span>
      </div>
    </section>
  );
}

function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="font-mono text-[11px] text-text-2 border border-line rounded-[5px] px-[6px] py-[2px] leading-none">
      {children}
    </span>
  );
}

function RelativeUpdated({ iso, t }: { iso: string; t: Translator['t'] }): JSX.Element {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  let label: string;
  if (diff < min) label = t('time.justNow');
  else if (diff < hour) label = t('time.minutesAgo', { n: Math.floor(diff / min) });
  else if (diff < day) label = t('time.hoursAgo', { n: Math.floor(diff / hour) });
  else label = t('time.daysAgo', { n: Math.floor(diff / day) });
  return <span>{label}</span>;
}
