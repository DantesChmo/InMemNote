import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Build config for the Electron main process.
// Node environment only — nothing DOM/browser-shaped lives here.
export default defineConfig({
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
      '@application': resolve(__dirname, 'src/application'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    rollupOptions: {
      // Force the output filename so `package.json#main` (`.vite/build/main.js`)
      // resolves; by default Vite names the bundle after the entry file.
      output: { entryFileNames: 'main.js' },
      // `better-sqlite3` is a native module — must not be bundled by Rollup.
      external: ['electron', 'better-sqlite3'],
    },
  },
});
