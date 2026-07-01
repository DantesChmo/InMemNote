import { useAppDispatch } from '@presentation/app/store';
import { SettingsPopup } from '@presentation/settings/SettingsPopup';
import { fetchSettings } from '@presentation/settings/slice';
import { checkForUpdate, updateActions } from '@presentation/update/slice';
import { UpdateBanner } from '@presentation/update/UpdateBanner';
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
 * list refreshes when, e.g., a draft is promoted from the overlay. We also
 * run an update check and subscribe to the main-process update broadcasts so
 * the banner surfaces without the user hunting for it.
 */
export function LibraryWindow(): JSX.Element {
  const dispatch = useAppDispatch();

  useEffect(() => {
    void dispatch(fetchNotes());
    // Settings are loaded once at mount so the Settings popup opens
    // instantly; subsequent saves and cross-window broadcasts keep the
    // Redux cache fresh (see `wireSettings` in `app/main.tsx`).
    void dispatch(fetchSettings());
    const unsubNotes = window.inmemnote.notes.onChanged(() => void dispatch(fetchNotes()));

    // Opening the Library is a natural moment to check; the main process also
    // checks on startup and on a timer and broadcasts what it finds.
    void dispatch(checkForUpdate());
    const unsubAvailable = window.inmemnote.update.onAvailable((u) =>
      dispatch(updateActions.setAvailable(u)),
    );
    const unsubProgress = window.inmemnote.update.onProgress((p) =>
      dispatch(updateActions.setProgress(p)),
    );

    return () => {
      unsubNotes();
      unsubAvailable();
      unsubProgress();
    };
  }, [dispatch]);

  return (
    <div className="h-screen w-screen flex flex-col bg-panel text-text">
      <LibraryToolbar />
      <UpdateBanner />
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
