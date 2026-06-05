import { useAppDispatch, useAppSelector } from '@presentation/app/store';

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

  const listTitle = query
    ? 'Результаты'
    : filter === 'pinned'
      ? 'Закреплённые'
      : 'Все заметки';

  return (
    <section className="border-r border-line flex flex-col min-h-0 bg-panel">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <span className="text-[14px] font-semibold">{listTitle}</span>
        <span className="text-[11px] text-text-3">По дате</span>
      </div>
      {notes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2.5 px-8 text-center text-text-3">
          <div className="text-[13px] text-text-2">Ничего не найдено</div>
          <div className="text-[12px]">
            {query ? `Запрос «${query}» ничего не нашёл` : 'В этом разделе пусто'}
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
                    dangerouslySetInnerHTML={{ __html: highlightHTML(n.title, query) }}
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
                  <RelativeUpdated iso={n.updatedAt} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Compact relative time. Avoids importing an i18n lib for one label. */
function RelativeUpdated({ iso }: { iso: string }): JSX.Element {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  let label: string;
  if (diff < min) label = 'только что';
  else if (diff < hour) label = `${Math.floor(diff / min)} мин назад`;
  else if (diff < day) label = `${Math.floor(diff / hour)} ч назад`;
  else label = `${Math.floor(diff / day)} д назад`;
  return <span>{label}</span>;
}
