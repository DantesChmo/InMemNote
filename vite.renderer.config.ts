import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Build config for the renderer process (React UI).
// DOM, React, Tailwind, CodeMirror all live here.
//
// `base: './'` keeps generated asset URLs relative so they resolve under the
// production `file://` origin. PostCSS plugins (Tailwind + autoprefixer) are
// configured via `postcss.config.cjs` so Vite picks them up unambiguously.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
      '@application': resolve(__dirname, 'src/application'),
      '@presentation': resolve(__dirname, 'src/presentation'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});
