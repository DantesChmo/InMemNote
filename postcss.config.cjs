// CommonJS PostCSS config. We use `.cjs` rather than `.mjs`/`.ts` because
// Forge's vite plugin auto-detect can miss ESM/TS variants depending on
// version, leaving Tailwind's `@tailwind` directives unprocessed.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
