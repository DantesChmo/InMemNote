import { useAppDispatch, useAppSelector } from '@presentation/app/store';
import { useTranslation } from '@presentation/i18n/useTranslation';

import { installUpdate, updateActions } from './slice';

/**
 * A one-line banner across the top of the Library window announcing a newer
 * release. Hidden entirely until the main-process check reports one.
 *
 * The flow is deliberately one-click: "Update & restart" downloads the DMG
 * (progress shown inline) and hands off to the detached helper that swaps the
 * bundle and relaunches — so the user never re-runs the `curl` installer by
 * hand. "Later" hides the banner; the periodic check re-surfaces it next time.
 */
export function UpdateBanner(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const available = useAppSelector((s) => s.update.available);
  const phase = useAppSelector((s) => s.update.phase);
  const progress = useAppSelector((s) => s.update.progress);
  const { t } = useTranslation();

  if (!available) return null;

  const downloading = phase === 'downloading';
  const failed = phase === 'error';
  const percent = Math.round(progress * 100);

  const message = failed
    ? t('update.failed')
    : downloading
      ? t('update.downloading', { percent })
      : t('update.available', { version: available.version });

  return (
    <div
      role="status"
      className="lib-no-drag flex items-center gap-3 h-10 px-4 bg-[var(--accent-tint)] border-b border-line text-[13px] text-text"
      aria-label="Update available"
    >
      <svg
        viewBox="0 0 16 16"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent shrink-0"
      >
        <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13h10" />
      </svg>
      <span className="flex-1 min-w-0 truncate">{message}</span>

      {downloading ? (
        <div className="w-28 h-1.5 rounded bg-[var(--sink)] overflow-hidden" aria-hidden>
          <div
            className="h-full bg-accent transition-[width] duration-150"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : (
        <>
          <a
            href={available.notesUrl}
            target="_blank"
            rel="noreferrer"
            className="text-text-2 hover:text-text underline-offset-2 hover:underline"
          >
            {t('update.notes')}
          </a>
          <button
            type="button"
            onClick={() => dispatch(updateActions.dismiss())}
            className="h-7 px-2.5 rounded-icon text-text-2 hover:bg-[var(--hl)] hover:text-text"
          >
            {t('update.later')}
          </button>
          <button
            type="button"
            onClick={() => void dispatch(installUpdate())}
            className="h-7 px-3 rounded-icon bg-accent border border-accent text-accent-ink hover:brightness-110"
          >
            {t('update.install')}
          </button>
        </>
      )}
    </div>
  );
}
