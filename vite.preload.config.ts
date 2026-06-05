import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Build config for the preload script.
// Preload is the bridge between Node (main) and DOM (renderer). It runs inside
// the renderer process but has Node API access, and exposes a narrow typed API
// to the renderer through `contextBridge`.
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
      // Emit alongside `main.js` in the same `.vite/build` folder; main.ts
      // resolves the preload as `join(__dirname, 'preload.js')`.
      output: { entryFileNames: 'preload.js' },
      external: ['electron'],
    },
  },
});
