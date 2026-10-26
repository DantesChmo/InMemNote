import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({ locale: 'en' as const, t: (k: string) => k }),
}));

// We stub the domain `Hotkey.fromTokens` so the unit test does not depend on
// the exact accelerator alphabet — only on the contract: tokens come in, an
// accelerator string comes out.
// A spec can flip `rejectWith` to simulate the domain refusing a combo.
const domain = vi.hoisted(() => ({ rejectWith: null as string | null }));
vi.mock('@domain/settings/Hotkey', () => ({
  Hotkey: {
    fromTokens: (tokens: readonly string[]) =>
      domain.rejectWith === null
        ? { ok: true, value: { accelerator: tokens.join('+') } }
        : { ok: false, error: { message: domain.rejectWith } },
  },
}));

import { HotkeyInput } from './HotkeyInput';

describe('HotkeyInput (shallow)', () => {
  beforeEach(() => {
    domain.rejectWith = null;
  });
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
  describe('keystroke → accelerator tokens (TZ 4b.3)', () => {
    const capture = (init: KeyboardEventInit): string | undefined => {
      const onChange = vi.fn();
      render(<HotkeyInput value="" onChange={onChange} />);
      fireEvent.click(screen.getByText('settings.hotkey.change'));
      fireEvent.keyDown(document.querySelector('.sr-only')!, init);
      return onChange.mock.calls[0]?.[0] as string | undefined;
    };

    it.each([
      [{ key: 'k', metaKey: true }, 'Command+K'],
      [{ key: 'K', shiftKey: true, ctrlKey: true }, 'Control+Shift+K'],
      [{ key: '7', altKey: true }, 'Option+7'],
      [{ key: ' ', metaKey: true, shiftKey: true }, 'Command+Shift+Space'],
      [{ key: 'Enter', ctrlKey: true }, 'Control+Return'],
      [{ key: 'ArrowUp', metaKey: true }, 'Command+Up'],
      [{ key: 'ArrowRight', metaKey: true }, 'Command+Right'],
      [{ key: 'ArrowDown', metaKey: true }, 'Command+Down'],
      [{ key: 'ArrowLeft', metaKey: true }, 'Command+Left'],
      [{ key: 'Tab', ctrlKey: true }, 'Control+Tab'],
      [{ key: 'Backspace', metaKey: true }, 'Command+Backspace'],
      [{ key: 'Delete', metaKey: true }, 'Command+Delete'],
      [{ key: 'Home', ctrlKey: true }, 'Control+Home'],
      [{ key: 'End', ctrlKey: true }, 'Control+End'],
      [{ key: 'PageUp', ctrlKey: true }, 'Control+PageUp'],
      [{ key: 'Insert', ctrlKey: true }, 'Control+Insert'],
      [{ key: 'PageDown', ctrlKey: true }, 'Control+PageDown'],
      [{ key: 'F1', metaKey: true }, 'Command+F1'],
      [{ key: 'F24', metaKey: true }, 'Command+F24'],
    ])('%j commits %s', (init, expected) => {
      expect(capture(init)).toBe(expected);
    });

    it('lists modifiers in a fixed order whatever order they were pressed in', () => {
      expect(
        capture({ key: 'a', shiftKey: true, altKey: true, ctrlKey: true, metaKey: true }),
      ).toBe('Command+Control+Option+Shift+A');
    });

    it.each([['F25'], ['Dead'], ['CapsLock'], ['Meta'], ['Alt'], ['Control']])(
      'ignores %s, which is not a usable target key, and keeps listening',
      (key) => {
        expect(capture({ key, metaKey: true })).toBeUndefined();
        expect(screen.getByText('settings.hotkey.cancel')).toBeInTheDocument();
      },
    );
  });

  describe('validation through the domain', () => {
    it('shows the domain message, keeps capturing, and does not report the combo', () => {
      domain.rejectWith = 'A global shortcut needs a modifier';
      const onChange = vi.fn();
      render(<HotkeyInput value="Command+K" onChange={onChange} />);
      fireEvent.click(screen.getByText('settings.hotkey.change'));

      fireEvent.keyDown(document.querySelector('.sr-only')!, { key: 'a' });

      expect(screen.getByText('A global shortcut needs a modifier')).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByText('settings.hotkey.cancel')).toBeInTheDocument();
    });

    it('clears the message once a valid combo is captured', () => {
      domain.rejectWith = 'A global shortcut needs a modifier';
      const onChange = vi.fn();
      render(<HotkeyInput value="" onChange={onChange} />);
      fireEvent.click(screen.getByText('settings.hotkey.change'));
      const trap = document.querySelector('.sr-only')!;
      fireEvent.keyDown(trap, { key: 'a' });

      domain.rejectWith = null;
      fireEvent.keyDown(trap, { key: 'a', metaKey: true });

      expect(onChange).toHaveBeenCalledWith('Command+A');
      expect(screen.queryByText('A global shortcut needs a modifier')).toBeNull();
    });

    it('Escape after a rejected combo aborts and clears the message', () => {
      domain.rejectWith = 'Nope';
      render(<HotkeyInput value="Command+K" onChange={vi.fn()} />);
      fireEvent.click(screen.getByText('settings.hotkey.change'));
      const trap = document.querySelector('.sr-only')!;
      fireEvent.keyDown(trap, { key: 'a' });
      expect(screen.getByText('Nope')).toBeInTheDocument();

      fireEvent.keyDown(trap, { key: 'Escape' });

      expect(screen.queryByText('Nope')).toBeNull();
      expect(screen.getByText('settings.hotkey.change')).toBeInTheDocument();
    });
  });

  describe('cancel / abort', () => {
    it('the button turns into "cancel" while capturing and restores the old value on click', () => {
      const onChange = vi.fn();
      render(<HotkeyInput value="Command+K" onChange={onChange} />);
      fireEvent.click(screen.getByText('settings.hotkey.change'));
      expect(screen.queryByText(/⌘/)).toBeNull();

      fireEvent.click(screen.getByText('settings.hotkey.cancel'));

      expect(screen.getByText('settings.hotkey.change')).toBeInTheDocument();
      expect(screen.getByText('⌘ K')).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('leaving the capture area (blur) aborts the capture', () => {
      render(<HotkeyInput value="Command+K" onChange={vi.fn()} />);
      fireEvent.click(screen.getByText('settings.hotkey.change'));

      fireEvent.blur(document.querySelector('.sr-only')!);

      expect(screen.getByText('settings.hotkey.change')).toBeInTheDocument();
    });

    it('keystrokes while idle are not captured', () => {
      const onChange = vi.fn();
      render(<HotkeyInput value="" onChange={onChange} />);

      fireEvent.keyDown(document.querySelector('.sr-only')!, { key: 'a', metaKey: true });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('Escape while capturing does not bubble up, so it cannot also close the popup', () => {
      const parentKeyDown = vi.fn();
      render(
        <div onKeyDown={parentKeyDown}>
          <HotkeyInput value="" onChange={vi.fn()} />
        </div>,
      );
      fireEvent.click(screen.getByText('settings.hotkey.change'));

      fireEvent.keyDown(document.querySelector('.sr-only')!, { key: 'Escape' });
      expect(parentKeyDown).not.toHaveBeenCalled();

      // Idle Esc is not ours to swallow.
      fireEvent.keyDown(document.querySelector('.sr-only')!, { key: 'Escape' });
      expect(parentKeyDown).toHaveBeenCalledTimes(1);
    });
  });

  describe('display', () => {
    it('renders modifiers and special keys as glyphs and passes unknown tokens through', () => {
      render(<HotkeyInput value="Control+Option+Shift+Return" onChange={vi.fn()} />);
      expect(screen.getByText('⌃ ⌥ ⇧ ↩')).toBeInTheDocument();
    });

    it('passes a plain key token through unchanged', () => {
      render(<HotkeyInput value="Command+F5" onChange={vi.fn()} />);
      expect(screen.getByText('⌘ F5')).toBeInTheDocument();
    });
  });
});
