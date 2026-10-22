import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Content-Security-Policy for the renderer, injected as a `<meta>` tag.
 *
 * A meta tag rather than a response header because the packaged app loads
 * `index.html` over `file://`, where there are no headers to set.
 *
 * Shared by both builds:
 *   - `style-src 'unsafe-inline'` — CodeMirror injects `<style>` elements at
 *     runtime and React components set `style={…}`; neither can carry a
 *     nonce, so inline styles stay allowed. Inline *scripts* never are.
 *   - `img-src data:` — inline SVG/data URIs in CSS.
 *   - `connect-src` is `'self'` only: the renderer never talks to the
 *     network, the update feed is fetched by main.
 *
 * Dev-only relaxations (Vite dev server, `electron-forge start`):
 *   - `script-src 'unsafe-inline'` — `@vitejs/plugin-react` injects an
 *     inline react-refresh preamble into `index.html`.
 *   - `connect-src ws://localhost:*` — the HMR websocket.
 */
const CSP_COMMON = [
  "default-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
];
const CSP_PROD = [...CSP_COMMON, "script-src 'self'", "connect-src 'self'"].join('; ');
const CSP_DEV = [
  ...CSP_COMMON,
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' ws://localhost:*",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'inmemnote:csp',
    transformIndexHtml(_html, ctx) {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: ctx.server ? CSP_DEV : CSP_PROD,
          },
          // Must precede every script/style tag, or those load before the
          // policy applies.
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// Build config for the renderer process (React UI).
// DOM, React, Tailwind, CodeMirror all live here.
//
// `base: './'` keeps generated asset URLs relative so they resolve under the
// production `file://` origin. PostCSS plugins (Tailwind + autoprefixer) are
// configured via `postcss.config.cjs` so Vite picks them up unambiguously.
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
      '@application': resolve(__dirname, 'src/application'),
      '@presentation': resolve(__dirname, 'src/presentation'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});
