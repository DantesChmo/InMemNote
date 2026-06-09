import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({ locale: 'en' as const, t: (k: string) => k }),
}));

// We stub the domain `Hotkey.fromTokens` so the unit test does not depend on
// the exact accelerator alphabet — only on the contract: tokens come in, an
// accelerator string comes out.
vi.mock('@domain/settings/Hotkey', () => ({
  Hotkey: {
    fromTokens: (tokens: readonly string[]) => ({
      ok: true,
      value: { accelerator: tokens.join('+') },
    }),
  },
}));

import { HotkeyInput } from './HotkeyInput';

describe('HotkeyInput (shallow)', () => {
  beforeEach(() => undefined);
  afterEach(() => vi.restoreAllMocks());

  it('renders the formatted accelerator and the "change" button in idle mode', () => {
    render(<HotkeyInput value="CommandOrControl+Shift+Space" onChange={vi.fn()} />);
    expect(screen.getByText('settings.hotkey.change')).toBeInTheDocument();
    // ⌘ comes from CommandOrControl mapping; ⇧ from Shift; "Space" stays literal.
    expect(screen.getByText(/⌘.*⇧.*Space/)).toBeInTheDocument();
  });

  it('switches to capturing mode and shows the placeholder', () => {
    render(<HotkeyInput value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('settings.hotkey.change'));
    expect(screen.getByText('settings.hotkey.capturePlaceholder')).toBeInTheDocument();
    expect(screen.getByText('settings.hotkey.cancel')).toBeInTheDocument();
  });

  it('renders an em-dash when the value is empty', () => {
    render(<HotkeyInput value="" onChange={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('a captured combo calls onChange and returns to idle', () => {
    const onChange = vi.fn();
    render(<HotkeyInput value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('settings.hotkey.change'));

    const trap = document.querySelector('.sr-only')!;
    act(() => {
      fireEvent.keyDown(trap, { key: 'a', metaKey: true });
    });
    expect(onChange).toHaveBeenCalledWith('Command+A');
    expect(screen.getByText('settings.hotkey.change')).toBeInTheDocument();
  });

  it('Escape inside capture aborts without onChange', () => {
    const onChange = vi.fn();
    render(<HotkeyInput value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('settings.hotkey.change'));
    const trap = document.querySelector('.sr-only')!;
    fireEvent.keyDown(trap, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('settings.hotkey.change')).toBeInTheDocument();
  });

  it('modifier-only keydown is ignored', () => {
    const onChange = vi.fn();
    render(<HotkeyInput value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('settings.hotkey.change'));
    const trap = document.querySelector('.sr-only')!;
    fireEvent.keyDown(trap, { key: 'Shift', shiftKey: true });
    expect(onChange).not.toHaveBeenCalled();
    // Still capturing.
    expect(screen.getByText('settings.hotkey.cancel')).toBeInTheDocument();
  });
});
