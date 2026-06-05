
import { DraftPanel } from '@presentation/draft/DraftPanel';
import { LibraryWindow } from '@presentation/library/LibraryWindow';
import { Provider } from 'react-redux';

import { store } from './store';

/**
 * Read `?view=` from the current URL once at module load.
 *
 * Both `Draft` and `Library` ship in the same renderer bundle (saves us a
 * second Vite config + a second preload script). Main appends the view name
 * to the URL when it loads the window; the renderer just dispatches.
 *
 * Default = library, because that's the surface the user sees from the Dock.
 */
function resolveView(): 'draft' | 'library' {
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === 'draft' ? 'draft' : 'library';
}

export function App(): JSX.Element {
  const view = resolveView();
  return <Provider store={store}>{view === 'draft' ? <DraftPanel /> : <LibraryWindow />}</Provider>;
}
