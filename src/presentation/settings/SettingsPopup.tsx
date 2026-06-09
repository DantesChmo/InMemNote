import { useAppDispatch, useAppSelector } from '@presentation/app/store';
import { useTranslation, type Translator } from '@presentation/i18n/useTranslation';
import { useEffect, useMemo, useState } from 'react';

import { applyAppearance } from './applyTheme';
import { HotkeyInput } from './HotkeyInput';
import { PaletteEditor } from './PaletteEditor';
import { saveSettings, settingsActions } from './slice';

import type { AppSettingsDTO } from '@infrastructure/electron/ipc-channels';
import type { MessageKey } from '@presentation/i18n/messages';

/**
 * Settings — a modal popup over the Library window.
 *
 * Why a modal (not a separate BrowserWindow):
 *   - The popup is short-lived UX; opening a window would show a Dock-jump
 *     animation and create a context the user would have to manage.
 *   - Settings affect the renderer's DOM (theme + palette tokens). A modal
 *     in the same renderer means the preview is "live" — the moment the user
 *     drags the color picker, the underlying Library reflects the new
 *     palette behind the dim layer.
 *
 * Save model:
 *   - Local form state during editing; nothing is persisted until "Сохранить".
 *   - The live preview happens by applying the FORM state to the DOM through
 *     `applyAppearance` while the popup is open. Closing without saving rolls
 *     back to the last persisted snapshot.
 */
type Section = 'palette' | 'hotkeys' | 'language';

const SECTION_LABEL_KEYS: Record<Section, MessageKey> = {
  palette: 'settings.section.palette',
  hotkeys: 'settings.section.hotkeys',
  language: 'settings.section.language',
};

const SECTION_ORDER: readonly Section[] = ['palette', 'hotkeys', 'language'];

export function SettingsPopup(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const popupOpen = useAppSelector((s) => s.settings.popupOpen);
  const current = useAppSelector((s) => s.settings.current);
  const saving = useAppSelector((s) => s.settings.saving);
  const error = useAppSelector((s) => s.settings.error);
  const { t } = useTranslation();

  // Form state mirrors the persisted DTO. We seed it whenever the popup is
  // opened so any edits made in another window since last open are picked
  // up — and we resnap to `current` if the broadcast subscriber updates the
  // store while the popup is closed.
  const [form, setForm] = useState<AppSettingsDTO | null>(current);
  const [section, setSection] = useState<Section>('palette');

  useEffect(() => {
    if (popupOpen) setForm(current);
  }, [popupOpen, current]);

  // Live preview: while the popup is open, paint the FORM state on the DOM
  // so the user sees palette changes the moment they slide the color picker.
  // When the popup closes without saving, restore the last persisted state —
  // otherwise the canceled preview would persist visually until the next
  // theme broadcast.
  useEffect(() => {
    if (!popupOpen || !form) return;
    applyAppearance(form);
  }, [popupOpen, form]);
  useEffect(() => {
    if (popupOpen) return;
    if (current) applyAppearance(current);
  }, [popupOpen, current]);

  // Close on Escape, but only when nothing inside (like the hotkey-capture
  // trap) is actively absorbing keystrokes.
  useEffect(() => {
    if (!popupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      dispatch(settingsActions.closePopup());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popupOpen, dispatch]);

  const dirty = useMemo(() => {
    if (!current || !form) return false;
    if (form.themeMode !== current.themeMode) return true;
    if (form.language !== current.language) return true;
    if (form.openDraftHotkey !== current.openDraftHotkey) return true;
    return !shallowEqual(form.palette, current.palette);
  }, [current, form]);

  if (!popupOpen || !form) return null;

  const onSave = async (): Promise<void> => {
    const action = await dispatch(saveSettings(form));
    if (saveSettings.fulfilled.match(action)) {
      dispatch(settingsActions.closePopup());
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Click on the dim layer (not children) closes — same rule as macOS
        // sheets that the user dismisses with a stray click.
        if (e.target === e.currentTarget) {
          dispatch(settingsActions.closePopup());
        }
      }}
    >
      <div
        className="w-[640px] max-w-[92vw] max-h-[88vh] flex flex-col bg-panel border border-line rounded-panel shadow-panel overflow-hidden"
        role="dialog"
        aria-label={t('settings.title')}
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between h-[52px] px-5 border-b border-line">
          <div className="text-[14px] font-medium text-text">{t('settings.title')}</div>
          <button
            type="button"
            onClick={() => dispatch(settingsActions.closePopup())}
            className="w-7 h-7 flex items-center justify-center rounded-icon text-text-2 hover:bg-[var(--hl)]"
            aria-label={t('common.close')}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Section nav */}
          <nav className="w-[148px] shrink-0 border-r border-line bg-[var(--panel-2)] p-2">
            {SECTION_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={`w-full text-left text-[13px] px-2.5 py-[7px] rounded-icon mb-0.5 ${
                  section === s
                    ? 'bg-[var(--accent-tint)] text-text'
                    : 'text-text-2 hover:bg-[var(--hl)]'
                }`}
              >
                {t(SECTION_LABEL_KEYS[s])}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5">
            {(() => {
              const patch = (next: Partial<AppSettingsDTO>): void => setForm({ ...form, ...next });
              switch (section) {
                case 'palette':
                  return <PaletteSection form={form} onForm={patch} t={t} />;
                case 'hotkeys':
                  return <HotkeysSection form={form} onForm={patch} t={t} />;
                case 'language':
                  return <LanguageSection form={form} onForm={patch} t={t} />;
              }
            })()}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between h-[58px] px-5 border-t border-line bg-[var(--panel-2)]">
          <div className="text-[12px] text-text-3 min-h-[16px]">
            {error ? <span className="text-red-500">{error}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => dispatch(settingsActions.closePopup())}
              className="h-8 px-3 rounded-icon border border-line text-[13px] text-text hover:bg-[var(--hl)]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!dirty || saving}
              className="h-8 px-3 rounded-icon bg-accent border border-accent text-accent-ink text-[13px] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  form: AppSettingsDTO;
  onForm: (patch: Partial<AppSettingsDTO>) => void;
  t: Translator['t'];
}

function PaletteSection({ form, onForm, t }: SectionProps): JSX.Element {
  const themeOptions: { value: AppSettingsDTO['themeMode']; label: string }[] = [
    { value: 'system', label: t('settings.theme.system') },
    { value: 'dark', label: t('settings.theme.dark') },
    { value: 'light', label: t('settings.theme.light') },
  ];
  return (
    <div className="flex flex-col gap-5">
      <Field label={t('settings.theme.label')} hint={t('settings.theme.hint')}>
        <div className="flex gap-1 p-1 rounded-icon bg-[var(--sink)] border border-line w-fit">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onForm({ themeMode: opt.value })}
              className={`px-3 py-1 rounded-icon text-[12px] ${
                form.themeMode === opt.value
                  ? 'bg-[var(--panel)] text-text shadow-sm'
                  : 'text-text-2 hover:text-text'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('settings.colors.label')} hint={t('settings.colors.hint')}>
        <PaletteEditor
          value={form.palette}
          onChange={(palette) => onForm({ palette })}
        />
      </Field>
    </div>
  );
}

function HotkeysSection({ form, onForm, t }: SectionProps): JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      <Field
        label={t('settings.openDraft.label')}
        hint={t('settings.openDraft.hint')}
      >
        <HotkeyInput
          value={form.openDraftHotkey}
          onChange={(openDraftHotkey) => onForm({ openDraftHotkey })}
        />
      </Field>
    </div>
  );
}

function LanguageSection({ form, onForm, t }: SectionProps): JSX.Element {
  const langOptions: { value: AppSettingsDTO['language']; label: string }[] = [
    { value: 'system', label: t('settings.language.system') },
    { value: 'en', label: t('settings.language.en') },
    { value: 'ru', label: t('settings.language.ru') },
  ];
  return (
    <div className="flex flex-col gap-5">
      <Field
        label={t('settings.language.label')}
        hint={t('settings.language.hint')}
      >
        <div className="flex gap-1 p-1 rounded-icon bg-[var(--sink)] border border-line w-fit">
          {langOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onForm({ language: opt.value })}
              className={`px-3 py-1 rounded-icon text-[12px] ${
                form.language === opt.value
                  ? 'bg-[var(--panel)] text-text shadow-sm'
                  : 'text-text-2 hover:text-text'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] uppercase tracking-[0.7px] text-text-3">{label}</span>
        {hint ? <span className="text-[11px] text-text-3 text-right max-w-[60%]">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function shallowEqual(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
