import {
  PALETTE_TOKEN_KEYS,
  PaletteOverrides,
  type PaletteTokenKey,
} from '@domain/settings/PaletteOverrides';
import { useTranslation, type Translator } from '@presentation/i18n/useTranslation';

import type { AppSettingsDTO } from '@infrastructure/electron/ipc-channels';
import type { MessageKey } from '@presentation/i18n/messages';

/**
 * Color-picker editor for `PALETTE_TOKEN_KEYS`.
 *
 * Each row is independent: a token without an override falls through to the
 * theme default in `tokens.css`. The native `<input type="color">` emits
 * `#RRGGBB` — that's why the `Reset` button exists, since unsetting a value
 * via the picker alone is impossible.
 *
 * Mattermost-style JSON import is intentionally out of scope here; the
 * shipped surface is a per-token picker. The aggregate is still stored as a
 * JSON map under the hood, so a later "Import…" button can drop straight in.
 */
const ROW_LABEL_KEYS: Record<PaletteTokenKey, MessageKey> = {
  accent: 'settings.palette.accent',
  'accent-ink': 'settings.palette.accentInk',
  panel: 'settings.palette.panel',
  'panel-2': 'settings.palette.panel2',
  sink: 'settings.palette.sink',
  text: 'settings.palette.text',
  'text-2': 'settings.palette.text2',
  'text-3': 'settings.palette.text3',
  bar: 'settings.palette.bar',
};

export interface PaletteEditorProps {
  value: AppSettingsDTO['palette'];
  onChange: (next: AppSettingsDTO['palette']) => void;
}

export function PaletteEditor({ value, onChange }: PaletteEditorProps): JSX.Element {
  const { t }: Translator = useTranslation();
  const set = (key: PaletteTokenKey, color: string): void => {
    if (!PaletteOverrides.isValidColor(color)) return;
    onChange({ ...value, [key]: color });
  };
  const clear = (key: PaletteTokenKey): void => {
    if (!(key in value)) return;
    const next = { ...value };
    delete next[key];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {PALETTE_TOKEN_KEYS.map((key) => {
        const override = value[key];
        // The picker is a native <input type="color"> that always needs a
        // concrete value; when nothing is overridden, we read the live CSS
        // custom property so the swatch matches what the user sees.
        const live = readResolvedColor(key);
        const display = override ?? live;
        const isOverridden = override !== undefined;
        return (
          <div
            key={key}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 rounded-icon bg-[var(--sink)] border border-line"
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[13px] text-text truncate">{t(ROW_LABEL_KEYS[key])}</span>
              <span className="text-[10px] font-mono text-text-3 truncate">
                {`--${key}`}
                {!isOverridden ? t('settings.colors.defaultSuffix') : ''}
              </span>
            </div>
            <label
              className="relative w-7 h-7 rounded-icon border border-line cursor-pointer overflow-hidden"
              style={{ backgroundColor: display }}
              aria-label={t('settings.colors.pickAria', { key })}
            >
              <input
                type="color"
                value={normalizeForPicker(display)}
                onChange={(e) => set(key, e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={() => clear(key)}
              disabled={!isOverridden}
              className="text-[11px] px-2 py-1 rounded-icon border border-line text-text-2 hover:bg-[var(--hl)] disabled:opacity-40 disabled:cursor-not-allowed"
              title={t('settings.colors.resetTooltip')}
            >
              {t('common.reset')}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Read the currently-rendered value of a `--token` from the root element.
 * Used as the picker's seed when nothing is overridden yet. Trimmed because
 * `getComputedStyle` returns leading whitespace for inherited custom props.
 */
function readResolvedColor(key: PaletteTokenKey): string {
  if (typeof window === 'undefined') return '#000000';
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim();
  return v.length > 0 ? v : '#000000';
}

/**
 * The native color picker accepts only `#RRGGBB`. Tokens that resolve to
 * `rgb(...)`, `oklch(...)`, or a 3/8-digit hex are coerced to the closest
 * 6-digit hex via a hidden canvas. Anything we can't parse falls back to
 * black — the user can then immediately pick a real color.
 */
function normalizeForPicker(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const r = value[1]!;
    const g = value[2]!;
    const b = value[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (typeof document === 'undefined') return '#000000';
  // Canvas-based parsing handles `rgb()`, `rgba()`, named colors, etc.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#000000';
  ctx.fillStyle = '#000';
  ctx.fillStyle = value;
  const computed = ctx.fillStyle;
  if (typeof computed === 'string' && /^#[0-9a-fA-F]{6}$/.test(computed)) return computed;
  // Some browsers emit `rgba(r, g, b, a)` here; collapse to hex.
  const m = typeof computed === 'string' ? computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/) : null;
  if (m) {
    const toHex = (n: string): string => parseInt(n, 10).toString(16).padStart(2, '0');
    return `#${toHex(m[1]!)}${toHex(m[2]!)}${toHex(m[3]!)}`;
  }
  return '#000000';
}
