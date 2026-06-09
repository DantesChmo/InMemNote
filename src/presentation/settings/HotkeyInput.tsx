import { Hotkey } from '@domain/settings/Hotkey';
import { useTranslation } from '@presentation/i18n/useTranslation';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Capture-style input for an Electron accelerator.
 *
 * Idle state shows the current accelerator with a single tap target labeled
 * "Изменить…". When the user clicks, we focus an invisible focus trap, listen
 * to the next `keydown`, and convert the React event into an accelerator
 * tokens list. ESC aborts; any complete combo (≥1 non-modifier) commits.
 *
 * Validation happens through the domain `Hotkey.fromTokens` factory, so the
 * UI shares the exact rules the YAML loader and the IPC handler use.
 */
export interface HotkeyInputProps {
  value: string;
  onChange: (next: string) => void;
}

type Mode = 'idle' | 'capturing';

const MODIFIER_DISPLAY: Record<string, string> = {
  CommandOrControl: '⌘',
  Command: '⌘',
  Cmd: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Option: '⌥',
  Alt: '⌥',
  Shift: '⇧',
  Meta: '⌘',
  Super: '⌘',
};

const KEY_DISPLAY: Record<string, string> = {
  Space: 'Space',
  Return: '↩',
  Enter: '↩',
  Tab: '⇥',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: 'Esc',
  Esc: 'Esc',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
};

function renderToken(token: string): string {
  return MODIFIER_DISPLAY[token] ?? KEY_DISPLAY[token] ?? token;
}

function renderAccelerator(accel: string): string {
  if (accel.length === 0) return '—';
  return accel.split('+').map(renderToken).join(' ');
}

/**
 * Map a browser `KeyboardEvent` into an Electron accelerator token list.
 *
 * Returns `null` if the event is purely modifiers (the user hasn't pressed a
 * "target" key yet). The caller treats `null` as "keep listening".
 */
function eventToTokens(e: KeyboardEvent): readonly string[] | null {
  const tokens: string[] = [];
  if (e.metaKey) tokens.push('Command');
  if (e.ctrlKey) tokens.push('Control');
  if (e.altKey) tokens.push('Option');
  if (e.shiftKey) tokens.push('Shift');

  const target = mapKey(e);
  if (target === null) return null;
  tokens.push(target);
  return tokens;
}

/**
 * Translate `KeyboardEvent.key` / `.code` into the Electron-accelerator
 * vocabulary. Returns `null` for modifier-only events (Shift, Alt, …).
 */
function mapKey(e: KeyboardEvent): string | null {
  const k = e.key;
  // Letters: arrive lowercase when no Shift, uppercase with Shift; Electron
  // wants single uppercase letters regardless.
  if (/^[a-zA-Z]$/.test(k)) return k.toUpperCase();
  if (/^[0-9]$/.test(k)) return k;
  switch (k) {
    case ' ':
      return 'Space';
    case 'Enter':
      return 'Return';
    case 'Tab':
      return 'Tab';
    case 'Backspace':
      return 'Backspace';
    case 'Delete':
      return 'Delete';
    case 'ArrowUp':
      return 'Up';
    case 'ArrowDown':
      return 'Down';
    case 'ArrowLeft':
      return 'Left';
    case 'ArrowRight':
      return 'Right';
    case 'Home':
      return 'Home';
    case 'End':
      return 'End';
    case 'PageUp':
      return 'PageUp';
    case 'PageDown':
      return 'PageDown';
    case 'Insert':
      return 'Insert';
    case 'Escape':
      // Esc means "abort capture", not "the Escape key as part of a combo".
      return null;
    case 'Shift':
    case 'Control':
    case 'Alt':
    case 'Meta':
    case 'CapsLock':
      return null;
    default:
      // F1..F24 arrive as `key === 'F1'`.
      if (/^F([1-9]|1\d|2[0-4])$/.test(k)) return k;
      return null;
  }
}

export function HotkeyInput({ value, onChange }: HotkeyInputProps): JSX.Element {
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<string | null>(null);
  const trapRef = useRef<HTMLDivElement | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (mode !== 'capturing') return;
    trapRef.current?.focus();
  }, [mode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (mode !== 'capturing') return;
      e.preventDefault();
      e.stopPropagation();
      // Esc aborts the capture (and keeps the previous accelerator).
      if (e.key === 'Escape') {
        setMode('idle');
        setError(null);
        return;
      }
      const tokens = eventToTokens(e.nativeEvent);
      if (!tokens) return; // modifier-only press
      const result = Hotkey.fromTokens(tokens);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onChange(result.value.accelerator);
      setError(null);
      setMode('idle');
    },
    [mode, onChange],
  );

  return (
    <div className="flex flex-col gap-1.5" data-testid="hotkey-input">
      <div className="flex items-center gap-2">
        <div
          className={`flex-1 flex items-center min-h-[34px] px-3 rounded-icon border text-[13px] ${
            mode === 'capturing'
              ? 'border-accent bg-[var(--accent-tint-2)] text-text'
              : 'border-line bg-[var(--sink)] text-text'
          }`}
        >
          {mode === 'capturing' ? (
            <span className="text-text-2">{t('settings.hotkey.capturePlaceholder')}</span>
          ) : (
            <span className="font-mono tracking-wide">{renderAccelerator(value)}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'idle' ? 'capturing' : 'idle'))}
          className="h-[34px] px-3 rounded-icon border border-line text-[12px] text-text hover:bg-[var(--hl)]"
        >
          {mode === 'capturing' ? t('settings.hotkey.cancel') : t('settings.hotkey.change')}
        </button>
      </div>
      {/*
        Invisible focus trap that catches the keydown. We don't put the
        listener on `window` directly because that would also intercept
        keystrokes meant for the editor / search input behind the popup.
      */}
      <div
        ref={trapRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onBlur={() => setMode('idle')}
        className="sr-only"
      />
      {error ? <div className="text-[11px] text-red-500">{error}</div> : null}
    </div>
  );
}
