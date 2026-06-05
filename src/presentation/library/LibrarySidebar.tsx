import { useAppDispatch, useAppSelector } from '@presentation/app/store';
import { useMemo } from 'react';


import { fetchNotes, libraryActions } from './slice';

/**
 * Left-rail sidebar.
 *
 * V2 ships with only two "smart lists" — All and Pinned. Tags were dropped
 * from V2 by product decision, so we kept the section header out entirely;
 * adding it back later is a single block.
 */
export function LibrarySidebar(): JSX.Element {
  const dispatch = useAppDispatch();
  const { notes, filter, query } = useAppSelector((s) => s.library);

  // Counts shown next to each row. We compute them from the cached list to
  // stay reactive on add/delete without an extra IPC round-trip.
  const counts = useMemo(
    () => ({
      all: notes.length,
      pinned: notes.filter((n) => n.pinned).length,
    }),
    [notes],
  );

  const select = (next: 'all' | 'pinned') => {
    dispatch(libraryActions.setFilter(next));
    void dispatch(fetchNotes());
  };

  return (
    <aside
      className="border-r border-line bg-[var(--panel-2)] py-3.5 px-2.5 overflow-y-auto"
      aria-label="Library sections"
    >
      <SectionLabel>Библиотека</SectionLabel>
      <SidebarItem
        active={filter === 'all' && !query}
        label="Все заметки"
        count={counts.all}
        onClick={() => select('all')}
        icon={
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
            <path d="M3 4h10M3 8h10M3 12h7" />
          </svg>
        }
      />
      <SidebarItem
        active={filter === 'pinned' && !query}
        label="Закреплённые"
        count={counts.pinned}
        onClick={() => select('pinned')}
        icon={
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 1.5h4M7 1.5l-.4 4.2L4.5 8h7L9.4 5.7 9 1.5M8 8v6.5" />
          </svg>
        }
      />
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] tracking-[0.7px] uppercase text-text-3 px-2.5 mb-1.5">
      {children}
    </div>
  );
}

interface ItemProps {
  active: boolean;
  label: string;
  count: number;
  icon: React.ReactNode;
  onClick: () => void;
}

function SidebarItem({ active, label, count, icon, onClick }: ItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-icon text-[13px] text-left transition-colors ${
        active ? 'bg-[var(--accent-tint)] text-text' : 'hover:bg-[var(--hl)] text-text'
      }`}
    >
      <span className={`w-4 h-4 flex items-center justify-center ${active ? 'text-accent' : 'text-text-2'}`}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      <span className={`text-[11px] tabular-nums ${active ? 'text-accent' : 'text-text-3'}`}>
        {count}
      </span>
    </button>
  );
}
