import { useAppSelector } from '@presentation/app/store';
import { useTranslation } from '@presentation/i18n/useTranslation';

export interface StorageBannerProps {
  /** `full` — Library strip with reason; `compact` — one-line Draft strip. */
  variant?: 'full' | 'compact';
}

/**
 * Persistent warning that user data is not being written to disk.
 *
 * Main falls back to an in-memory repository when SQLite can't be opened,
 * and keeps a store marked degraded once one of its writes fails (disk full,
 * file deleted — ADR 0008); either way what the user writes is lost on quit.
 * That loss is silent unless we say so, hence: no dismiss button — the
 * condition can't be fixed from the UI and lasts the whole process
 * lifetime, so hiding it would only let the user forget.
 *
 * The `compact` variant lives in the Draft overlay and only cares about the
 * stores Draft writes to (drafts, and notes via ⌘↵ promote). A settings-only
 * fallback doesn't put the typed text at risk, so Draft stays clean.
 */
export function StorageBanner({ variant = 'full' }: StorageBannerProps): JSX.Element | null {
  const degraded = useAppSelector((s) => s.storage.degraded);
  const { t } = useTranslation();

  const notesAtRisk = degraded.some((d) => d.store !== 'settings');
  const reason = t('storage.reason', {
    reason: [...new Set(degraded.map((d) => d.reason))].join('; '),
  });

  if (variant === 'compact') {
    if (!notesAtRisk) return null;
    return (
      <div
        role="alert"
        title={reason}
        className="draft-no-drag flex items-center gap-2 h-7 px-6 bg-[var(--accent-tint)] border-b border-line text-[12px] text-text"
      >
        <WarningIcon size={12} />
        <span className="min-w-0 truncate">{t('storage.draftNotSaved')}</span>
      </div>
    );
  }

  if (degraded.length === 0) return null;
  return (
    <div
      role="alert"
      className="lib-no-drag flex items-center gap-3 h-10 px-4 bg-[var(--accent-tint)] border-b border-line text-[13px] text-text"
    >
      <WarningIcon size={16} />
      <span className="min-w-0 truncate">
        {t(notesAtRisk ? 'storage.notesNotSaved' : 'storage.settingsNotSaved')}
      </span>
      <span className="ml-auto max-w-[40%] shrink-0 truncate text-text-2" title={reason}>
        {reason}
      </span>
    </div>
  );
}

function WarningIcon({ size }: { size: number }): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-accent shrink-0"
      aria-hidden
    >
      <path d="M8 2.5L14 13H2L8 2.5zM8 6.5v3M8 11.5v.01" />
    </svg>
  );
}
