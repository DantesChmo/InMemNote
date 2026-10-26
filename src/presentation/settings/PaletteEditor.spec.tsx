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
    expect(screen.getAllByText((c) => c.includes('settings.colors.defaultSuffix'))).toHaveLength(2);
  });

  it('omits the defaultSuffix label on overridden tokens', () => {
    render(<PaletteEditor value={{ accent: '#ff0000' }} onChange={vi.fn()} />);
    // panel still defaults — exactly one suffix span remains.
    expect(screen.getAllByText((c) => c.includes('settings.colors.defaultSuffix'))).toHaveLength(1);
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
    render(<PaletteEditor value={{ accent: '#ff0000', panel: '#000000' }} onChange={onChange} />);
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
  it('a pick keeps the other overrides', () => {
    const onChange = vi.fn();
    render(<PaletteEditor value={{ panel: '#000000' }} onChange={onChange} />);
    fireEvent.change(
      screen.getAllByLabelText('settings.colors.pickAria')[0]!.querySelector('input')!,
      {
        target: { value: '#abcdef' },
      },
    );
    expect(onChange).toHaveBeenCalledWith({ panel: '#000000', accent: '#abcdef' });
  });

  it('reset does not mutate the value it was given', () => {
    const value = { accent: '#ff0000', panel: '#000000' };
    render(<PaletteEditor value={value} onChange={vi.fn()} />);
    fireEvent.click(screen.getAllByText('common.reset')[0]!);
    expect(value).toEqual({ accent: '#ff0000', panel: '#000000' });
  });

  // The native picker needs a concrete #RRGGBB; what the swatch/picker shows
  // for a token comes from either the override or the live CSS custom
  // property (TZ 4b.2: the user starts from what they currently see).
  describe('picker seed', () => {
    const pickerValue = (index: number): string =>
      (document.querySelectorAll('input[type="color"]')[index] as HTMLInputElement).value;

    afterEach(() => {
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--panel');
    });

    it('shows the live CSS value of a token that has no override', () => {
      document.documentElement.style.setProperty('--accent', '  #3f7d6b ');
      render(<PaletteEditor value={{}} onChange={vi.fn()} />);
      expect(pickerValue(0)).toBe('#3f7d6b');
    });

    it('prefers the override over the live CSS value', () => {
      document.documentElement.style.setProperty('--accent', '#3f7d6b');
      render(<PaletteEditor value={{ accent: '#112233' }} onChange={vi.fn()} />);
      expect(pickerValue(0)).toBe('#112233');
    });

    it('falls back to black when the token resolves to nothing', () => {
      render(<PaletteEditor value={{}} onChange={vi.fn()} />);
      expect(pickerValue(0)).toBe('#000000');
    });

    it('expands a 3-digit hex, which the native picker would reject', () => {
      render(<PaletteEditor value={{ accent: '#abc' }} onChange={vi.fn()} />);
      expect(pickerValue(0)).toBe('#aabbcc');
    });

    describe('non-hex values (rgb(), oklch(), named colors) are coerced through a canvas', () => {
      const stubCanvas = (resolve: (v: string) => string | null): void => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
          let current = '#000';
          return {
            get fillStyle() {
              return current;
            },
            set fillStyle(v: string) {
              const resolved = resolve(v);
              if (resolved !== null) current = resolved;
            },
          } as unknown as CanvasRenderingContext2D;
        });
      };

      it('uses the canvas hex when it normalises the value', () => {
        document.documentElement.style.setProperty('--accent', 'rebeccapurple');
        stubCanvas(() => '#663399');
        render(<PaletteEditor value={{}} onChange={vi.fn()} />);
        expect(pickerValue(0)).toBe('#663399');
      });

      it('collapses the rgba() form some engines return into a hex', () => {
        document.documentElement.style.setProperty('--accent', 'rgb(63 125 107 / 50%)');
        stubCanvas(() => 'rgba(63, 125, 107, 0.5)');
        render(<PaletteEditor value={{}} onChange={vi.fn()} />);
        expect(pickerValue(0)).toBe('#3f7d6b');
      });

      it('falls back to black for a value the canvas cannot parse (it keeps the seed)', () => {
        document.documentElement.style.setProperty('--accent', 'oklch(0.5 0.1 200)');
        stubCanvas(() => null);
        render(<PaletteEditor value={{}} onChange={vi.fn()} />);
        expect(pickerValue(0)).toBe('#000000');
      });

      it('falls back to black when there is no 2D context at all', () => {
        document.documentElement.style.setProperty('--accent', 'rgb(1, 2, 3)');
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        render(<PaletteEditor value={{}} onChange={vi.fn()} />);
        expect(pickerValue(0)).toBe('#000000');
      });
    });
  });
});
