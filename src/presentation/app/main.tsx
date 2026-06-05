import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@presentation/styles.css';

import { App } from './App';

// Track the system color scheme — `prefers-color-scheme` updates the document
// attribute that our tokens.css uses to switch palettes.
const themeMql = window.matchMedia('(prefers-color-scheme: light)');
const applyTheme = () => {
  document.documentElement.dataset.theme = themeMql.matches ? 'light' : 'dark';
};
applyTheme();
themeMql.addEventListener('change', applyTheme);

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
