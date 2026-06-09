import { applyAppearance } from '@presentation/settings/applyTheme';
import { settingsActions } from '@presentation/settings/slice';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@presentation/styles.css';

import { App } from './App';
import { store } from './store';

import type { AppSettingsDTO } from '@infrastructure/electron/ipc-channels';

// ---------- Appearance bootstrap ----------
//
// We start with `data-theme="dark"` so the first paint isn't white on a
// dark-default machine. Main pushes the persisted settings via
// `settings:changed` right after the renderer finishes loading; until then
// `prefers-color-scheme` is the only signal we have.
const themeMql = window.matchMedia('(prefers-color-scheme: light)');
const applySystemTheme = (): void => {
  // Skip when explicit settings are already in effect — `applyAppearance`
  // owns the `data-theme` attribute in that case.
  if (store.getState().settings.current && store.getState().settings.current!.themeMode !== 'system') {
    return;
  }
  document.documentElement.dataset.theme = themeMql.matches ? 'light' : 'dark';
};
applySystemTheme();
themeMql.addEventListener('change', applySystemTheme);

// Subscribe to settings broadcasts (initial push + subsequent saves) and to
// the store itself so unsaved-but-previewed edits flow into the DOM. The
// store path is what makes the popup feel "live" while the user is dragging
// the color picker — no IPC round-trip required.
window.inmemnote.settings.onChanged((next: AppSettingsDTO) => {
  store.dispatch(settingsActions.setFromBroadcast(next));
});

let lastApplied: AppSettingsDTO | null = null;
store.subscribe(() => {
  const next = store.getState().settings.current;
  if (!next) return;
  if (lastApplied && shallowEqualSettings(lastApplied, next)) return;
  lastApplied = next;
  applyAppearance(next);
});

function shallowEqualSettings(a: AppSettingsDTO, b: AppSettingsDTO): boolean {
  if (a.themeMode !== b.themeMode) return false;
  if (a.openDraftHotkey !== b.openDraftHotkey) return false;
  const ka = Object.keys(a.palette);
  const kb = Object.keys(b.palette);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a.palette[k] !== b.palette[k]) return false;
  return true;
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
