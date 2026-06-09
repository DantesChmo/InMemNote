import { useAppDispatch } from '@presentation/app/store';
import { SettingsPopup } from '@presentation/settings/SettingsPopup';
import { fetchSettings } from '@presentation/settings/slice';
import { useEffect } from 'react';


import { LibraryEditor } from './LibraryEditor';
import { LibraryNoteList } from './LibraryNoteList';
import { LibrarySidebar } from './LibrarySidebar';
import { LibraryToolbar } from './LibraryToolbar';
import { fetchNotes } from './slice';

/**
 * Library window root.
 *
 * Three-pane layout (sidebar | list | editor). The whole thing lives inside
 * the Electron BrowserWindow that opens at app launch and via Dock click.
 *
 * On mount we kick a fetch and subscribe to `notes:changed` broadcasts so the
 * list refreshes when, e.g., a draft is promoted from the overlay.
 */
export function LibraryWindow(): JSX.Element {
  const dispatch = useAppDispatch();

  useEffect(() => {
    void dispatch(fetchNotes());
    // Settings are loaded once at mount so the Settings popup opens
    // instantly; subsequent saves and cross-window broadcasts keep the
    // Redux cache fresh (see `wireSettings` in `app/main.tsx`).
    void dispatch(fetchSettings());
    const unsub = window.inmemnote.notes.onChanged(() => void dispatch(fetchNotes()));
    return unsub;
  }, [dispatch]);

  return (
    <div className="h-screen w-screen flex flex-col bg-panel text-text">
      <LibraryToolbar />
      <div
        className="flex-1 grid min-h-0"
        style={{ gridTemplateColumns: '208px 296px 1fr' }}
      >
        <LibrarySidebar />
        <LibraryNoteList />
        <LibraryEditor />
      </div>
      <SettingsPopup />
    </div>
  );
}
