// Design tokens live in CSS custom properties (src/presentation/theme/tokens.css).
// Tailwind here is only the utility layer; colors and sizes are referenced via
// var(--token) so the dark/light theme can swap without a rebuild.
//
// We use a `.cjs` config (not `.ts`) because the PostCSS chain that Vite hands
// Tailwind in production is plain Node, with no jiti TS hook — a TS config
// would be loaded as empty and Tailwind would emit only the preflight, missing
// every utility class our components rely on.
const { join } = require('node:path');

module.exports = {
  // Absolute paths: Forge invokes Vite from a build-time CWD that doesn't
  // necessarily match the project root, so a relative content glob can scan
  // nothing and Tailwind quietly emits only the preflight.
  content: [
    join(__dirname, 'index.html'),
    join(__dirname, 'src/presentation/**/*.{ts,tsx,html}'),
  ],
  theme: {
    extend: {
      colors: {
        panel: 'var(--panel)',
        text: {
          DEFAULT: 'var(--text)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
        },
        line: 'var(--line)',
        accent: {
          DEFAULT: 'var(--accent)',
          ink: 'var(--accent-ink)',
        },
        bar: 'var(--bar)',
        sel: 'var(--sel)',
      },
      borderRadius: {
        panel: '16px',
        pin: '14px',
        icon: '8px',
        pill: '12px',
      },
      fontFamily: {
        ui: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        panel: 'var(--shadow)',
        pin: 'var(--pin-shadow)',
      },
      width: {
        'draft-panel': '560px',
        'pin-panel': '320px',
      },
    },
  },
  plugins: [],
};
