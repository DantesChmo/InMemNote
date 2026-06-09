import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({ locale: 'en' as const, t: (k: string) => k }),
}));

// Mock the domain helper so we don't depend on its internal regexes; the
// component contract is "if `isValidColor` says yes, dispatch onChange".
vi.mock('@domain/settings/PaletteOverrides', () => ({
  PALETTE_TOKEN_KEYS: ['accent', 'panel'] as const,
  PaletteOverrides: {
    isValidColor: (s: string) => s.startsWith('#'),
  },
}));

import { PaletteEditor } from './PaletteEditor';

describe('PaletteEditor (shallow)', () => {
  beforeEach(() => undefined);
  afterEach(() => vi.restoreAllMocks());

  it('renders one row per token from PALETTE_TOKEN_KEYS', () => {
    render(<PaletteEditor value={{}} onChange={vi.fn()} />);
    // The token name and the defaultSuffix render inside the same span, so we
    // match by predicate to be tolerant of the concatenation.
    expect(screen.getByText((c) => c.startsWith('--accent'))).toBeInTheDocument();
    expect(screen.getByText((c) => c.startsWith('--panel'))).toBeInTheDocument();
    // One color picker per token.
    expect(document.querySelectorAll('input[type="color"]')).toHaveLength(2);
  });

  it('marks default-only tokens with the defaultSuffix label', () => {
    render(<PaletteEditor value={{}} onChange={vi.fn()} />);
    expect(
      screen.getAllByText((c) => c.includes('settings.colors.defaultSuffix')),
    ).toHaveLength(2);
  });

  it('omits the defaultSuffix label on overridden tokens', () => {
    render(<PaletteEditor value={{ accent: '#ff0000' }} onChange={vi.fn()} />);
    // panel still defaults — exactly one suffix span remains.
    expect(
      screen.getAllByText((c) => c.includes('settings.colors.defaultSuffix')),
    ).toHaveLength(1);
  });

  it('disables the reset button on tokens without an override', () => {
    render(<PaletteEditor value={{}} onChange={vi.fn()} />);
    for (const btn of screen.getAllByText('common.reset')) {
      expect(btn).toBeDisabled();
    }
  });

  it('enables the reset button only on overridden tokens', () => {
    render(<PaletteEditor value={{ accent: '#ff0000' }} onChange={vi.fn()} />);
    const buttons = screen.getAllByText('common.reset');
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it('clicking reset on an overridden token removes it from the value', () => {
    const onChange = vi.fn();
    render(
      <PaletteEditor
        value={{ accent: '#ff0000', panel: '#000000' }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getAllByText('common.reset')[0]!);
    expect(onChange).toHaveBeenCalledWith({ panel: '#000000' });
  });

  it('valid color picks call onChange with the new value', () => {
    const onChange = vi.fn();
    render(<PaletteEditor value={{}} onChange={onChange} />);
    const inputs = document.querySelectorAll('input[type="color"]');
    fireEvent.change(inputs[0]!, { target: { value: '#abcdef' } });
    expect(onChange).toHaveBeenCalledWith({ accent: '#abcdef' });
  });

  it('invalid color picks are swallowed', () => {
    const onChange = vi.fn();
    render(<PaletteEditor value={{}} onChange={onChange} />);
    const inputs = document.querySelectorAll('input[type="color"]');
    fireEvent.change(inputs[0]!, { target: { value: 'not-hex' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
