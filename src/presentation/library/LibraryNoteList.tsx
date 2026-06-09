import { useAppDispatch, useAppSelector } from '@presentation/app/store';
import { useTranslation, type Translator } from '@presentation/i18n/useTranslation';

import { highlightHTML } from './highlight';
import { previewOf } from './preview';
import { libraryActions } from './slice';

/**
 * Middle column: filtered list of note cards.
 *
 * Title and preview run through `highlightHTML` so search hits are visible.
 * We use `dangerouslySetInnerHTML` only for that pre-escaped output — no raw
 * user content is ever injected.
 */
export function LibraryNoteList(): JSX.Element {
  const dispatch = useAppDispatch();
  const { notes, query, selectedId, filter } = useAppSelector((s) => s.library);
  const { t } = useTranslation();

  const listTitle = query
    ? t('library.results')
    : filter === 'pinned'
      ? t('library.pinned')
      : t('library.allNotes');

  return (
    <section className="border-r border-line flex flex-col min-h-0 bg-panel">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <span className="text-[14px] font-semibold">{listTitle}</span>
        <span className="text-[11px] text-text-3">{t('library.sortByDate')}</span>
      </div>
      {notes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2.5 px-8 text-center text-text-3">
          <div className="text-[13px] text-text-2">{t('library.nothingFound')}</div>
          <div className="text-[12px]">
            {query ? t('library.queryNoMatch', { q: query }) : t('library.emptySection')}
          </div>
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto px-2.5 pb-3 flex flex-col gap-1.5"
          aria-label="Note list"
        >
          {notes.map((n) => {
            const active = n.id === selectedId;
            return (
              <button
                type="button"
                key={n.id}
                onClick={() => dispatch(libraryActions.setSelected(n.id))}
                className={`relative text-left border rounded-[11px] p-3 transition-colors ${
                  active
                    ? 'border-accent bg-[var(--accent-tint-2)]'
                    : 'border-line bg-panel hover:bg-[var(--hl)]'
                }`}
                aria-current={active}
                data-testid={`note-card-${n.id}`}
              >
                {active && (
                  <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[3px] bg-accent" />
                )}
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[13.5px] font-semibold flex-1 truncate"
                    dangerouslySetInnerHTML={{
                      __html: highlightHTML(n.title || t('library.untitled'), query),
                    }}
                  />
                  {n.pinned && (
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                      <path d="M6 1.5h4M7 1.5l-.4 4.2L4.5 8h7L9.4 5.7 9 1.5M8 8v6.5" />
                    </svg>
                  )}
                </div>
                <div
                  className="text-[12px] leading-[1.45] text-text-2 line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: highlightHTML(previewOf(n.content), query) }}
                />
                <div className="flex items-center gap-1.5 mt-2 text-[11px] text-text-3">
                  <RelativeUpdated iso={n.updatedAt} t={t} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Compact relative-time label.
 *
 * Localized via the shared dictionary so the pluralization style matches the
 * rest of the UI ("12 min ago" vs "12 мин назад"). We pass `t` in explicitly
 * because calling `useTranslation` from a child rerendered every minute
 * by the parent would be redundant work.
 */
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
