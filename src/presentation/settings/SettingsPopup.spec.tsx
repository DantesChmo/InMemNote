import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { settingsDTO } from '../../test/mockInmemnoteApi';

import { applyAppearance } from './applyTheme';
import { SettingsPopup } from './SettingsPopup';

import type { AppSettingsDTO } from '@shared/ipc';

const dispatch = vi.fn();
let state: {
  popupOpen: boolean;
  current: AppSettingsDTO | null;
  saving: boolean;
  error: string | null;
} = {
  popupOpen: true,
  current: settingsDTO(),
  saving: false,
  error: null,
};

vi.mock('@presentation/app/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (sel: (s: { settings: typeof state }) => unknown) => sel({ settings: state }),
}));

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({ locale: 'en' as const, t: (k: string) => k }),
}));

vi.mock('./applyTheme', () => ({
  applyAppearance: vi.fn(),
}));

vi.mock('./HotkeyInput', () => ({
  HotkeyInput: (props: { value: string; onChange: (v: string) => void }) => (
    <div
      data-testid="stub-hotkey-input"
      data-value={props.value}
      onClick={() => props.onChange('Command+K')}
    />
  ),
}));

vi.mock('./PaletteEditor', () => ({
  PaletteEditor: (props: {
    value: Readonly<Record<string, string>>;
    onChange: (v: Record<string, string>) => void;
  }) => (
    <div
      data-testid="stub-palette-editor"
      data-keys={Object.keys(props.value).join(',')}
      onClick={() => props.onChange({ accent: '#aabbcc' })}
    />
  ),
}));

// Mock the slice module so we can assert on saveSettings WITHOUT running the
// async thunk machinery. We expose a real `match` function so the popup's
// `if (fulfilled.match(action))` path works in the happy case.
const sliceMocks = vi.hoisted(() => {
  const saveResolvedAction = {
    type: 'settings/save/fulfilled',
    payload: { themeMode: 'system', language: 'en', palette: {}, openDraftHotkey: '' },
  };
  const saveSettingsThunk = vi.fn(() => async () => saveResolvedAction);
  return { saveResolvedAction, saveSettingsThunk };
});
vi.mock('./slice', () => ({
  saveSettings: Object.assign(sliceMocks.saveSettingsThunk, {
    fulfilled: {
      match: (a: unknown) => (a as { type: string }).type === 'settings/save/fulfilled',
    },
  }),
  settingsActions: {
    closePopup: () => ({ type: 'settings/closePopup' }),
  },
}));

describe('SettingsPopup (shallow)', () => {
  beforeEach(() => {
    dispatch.mockClear();
    sliceMocks.saveSettingsThunk.mockClear();
    vi.mocked(applyAppearance).mockClear();
    dispatch.mockReset();
    state = {
      popupOpen: true,
      current: settingsDTO(),
      saving: false,
      error: null,
    };
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns null when popupOpen is false at first render', () => {
    state = { ...state, popupOpen: false };
    const { container } = render(<SettingsPopup />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders dialog with sections and the palette section by default', () => {
    render(<SettingsPopup />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('settings.section.palette')).toBeInTheDocument();
    expect(screen.getByText('settings.section.hotkeys')).toBeInTheDocument();
    expect(screen.getByText('settings.section.language')).toBeInTheDocument();
    // Palette stub rendered.
    expect(screen.getByTestId('stub-palette-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-hotkey-input')).toBeNull();
  });

  it('clicking a section button switches the right pane', () => {
    render(<SettingsPopup />);
    fireEvent.click(screen.getByText('settings.section.hotkeys'));
    expect(screen.getByTestId('stub-hotkey-input')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-palette-editor')).toBeNull();

    fireEvent.click(screen.getByText('settings.section.language'));
    // Language uses local options — assert one of the labels shows.
    expect(screen.getByText('settings.language.system')).toBeInTheDocument();
  });

  it('save button is disabled while form matches current', () => {
    render(<SettingsPopup />);
    const save = screen.getByText('common.save');
    expect(save).toBeDisabled();
  });

  it('palette edit makes the save button dirty and saving dispatches the thunk', async () => {
    // For this test, dispatch must resolve to the fulfilled action so the
    // popup's `if (fulfilled.match(action))` guard succeeds.
    dispatch.mockImplementation(async (action: unknown) =>
      typeof action === 'function' ? sliceMocks.saveResolvedAction : action,
    );

    render(<SettingsPopup />);
    fireEvent.click(screen.getByTestId('stub-palette-editor'));

    const save = screen.getByText('common.save');
    expect(save).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(save);
    });

    expect(sliceMocks.saveSettingsThunk).toHaveBeenCalled();
    // The thunk + closePopup both go through dispatch.
    expect(dispatch).toHaveBeenCalledWith({ type: 'settings/closePopup' });
  });

  it('clicking the dim layer closes the popup', () => {
    render(<SettingsPopup />);
    const overlay = screen.getByRole('dialog').parentElement!;
    fireEvent.mouseDown(overlay, { target: overlay });
    expect(dispatch).toHaveBeenCalledWith({ type: 'settings/closePopup' });
  });

  it('clicking the X header button closes the popup', () => {
    render(<SettingsPopup />);
    fireEvent.click(screen.getByLabelText('common.close'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'settings/closePopup' });
  });

  it('clicking Cancel closes the popup', () => {
    render(<SettingsPopup />);
    fireEvent.click(screen.getByText('common.cancel'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'settings/closePopup' });
  });

  it('Escape on the window closes the popup', () => {
    render(<SettingsPopup />);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'settings/closePopup' });
  });

  it('renders error text when settings.error is set', () => {
    state = { ...state, error: 'kaboom' };
    render(<SettingsPopup />);
    expect(screen.getByText('kaboom')).toBeInTheDocument();
  });

  it('language section: clicking a button updates the form (save becomes enabled)', () => {
    render(<SettingsPopup />);
    fireEvent.click(screen.getByText('settings.section.language'));
    fireEvent.click(screen.getByText('settings.language.ru'));
    expect(screen.getByText('common.save')).not.toBeDisabled();
  });

  it('hotkeys section: capturing a new accelerator marks the form dirty', () => {
    render(<SettingsPopup />);
    fireEvent.click(screen.getByText('settings.section.hotkeys'));
    fireEvent.click(screen.getByTestId('stub-hotkey-input'));
    expect(screen.getByText('common.save')).not.toBeDisabled();
  });

  it('palette section: theme buttons toggle themeMode', () => {
    render(<SettingsPopup />);
    fireEvent.click(screen.getByText('settings.theme.dark'));
    expect(screen.getByText('common.save')).not.toBeDisabled();
  });

  it('renders "Saving..." while saving=true', () => {
    state = { ...state, saving: true };
    render(<SettingsPopup />);
    expect(screen.getByText('common.saving')).toBeInTheDocument();
  });
  it('renders nothing while the open popup has no settings loaded yet', () => {
    state = { ...state, current: null };
    const { container } = render(<SettingsPopup />);
    expect(container).toBeEmptyDOMElement();
  });

  describe('save outcome', () => {
    it('keeps the popup open when saving fails, so the error stays next to the form', async () => {
      dispatch.mockImplementation(async (action: unknown) =>
        typeof action === 'function' ? { type: 'settings/save/rejected' } : action,
      );
      render(<SettingsPopup />);
      fireEvent.click(screen.getByText('settings.theme.dark'));

      await act(async () => {
        fireEvent.click(screen.getByText('common.save'));
      });

      expect(sliceMocks.saveSettingsThunk).toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalledWith({ type: 'settings/closePopup' });
    });

    it('saves the edited form, not the persisted settings', async () => {
      dispatch.mockImplementation(async (action: unknown) =>
        typeof action === 'function' ? sliceMocks.saveResolvedAction : action,
      );
      render(<SettingsPopup />);
      fireEvent.click(screen.getByText('settings.theme.light'));
      fireEvent.click(screen.getByTestId('stub-palette-editor'));

      await act(async () => {
        fireEvent.click(screen.getByText('common.save'));
      });

      expect(sliceMocks.saveSettingsThunk).toHaveBeenCalledWith(
        settingsDTO({ themeMode: 'light', palette: { accent: '#aabbcc' } }),
      );
    });

    it('cannot be saved again while a save is in flight', () => {
      state = { ...state, saving: true };
      render(<SettingsPopup />);
      fireEvent.click(screen.getByText('settings.theme.dark'));
      expect(screen.getByText('common.saving')).toBeDisabled();
    });
  });

  describe('dirty detection', () => {
    it('re-picking the saved palette value is not a change', () => {
      state = { ...state, current: settingsDTO({ palette: { accent: '#aabbcc' } }) };
      render(<SettingsPopup />);
      fireEvent.click(screen.getByTestId('stub-palette-editor'));
      expect(screen.getByText('common.save')).toBeDisabled();
    });

    it('a different value for the same token is a change', () => {
      state = { ...state, current: settingsDTO({ palette: { accent: '#111111' } }) };
      render(<SettingsPopup />);
      fireEvent.click(screen.getByTestId('stub-palette-editor'));
      expect(screen.getByText('common.save')).not.toBeDisabled();
    });

    it('a different set of tokens is a change', () => {
      state = { ...state, current: settingsDTO({ palette: { panel: '#111111' } }) };
      render(<SettingsPopup />);
      fireEvent.click(screen.getByTestId('stub-palette-editor'));
      expect(screen.getByText('common.save')).not.toBeDisabled();
    });

    it('switching back to the saved theme makes the form clean again', () => {
      render(<SettingsPopup />);
      fireEvent.click(screen.getByText('settings.theme.dark'));
      expect(screen.getByText('common.save')).not.toBeDisabled();
      fireEvent.click(screen.getByText('settings.theme.system'));
      expect(screen.getByText('common.save')).toBeDisabled();
    });
  });

  describe('live preview (TZ 4b.2)', () => {
    it('paints the edited form on the DOM while the popup is open', () => {
      render(<SettingsPopup />);
      fireEvent.click(screen.getByText('settings.theme.dark'));
      fireEvent.click(screen.getByTestId('stub-palette-editor'));

      expect(applyAppearance).toHaveBeenLastCalledWith(
        expect.objectContaining({ themeMode: 'dark', palette: { accent: '#aabbcc' } }),
      );
    });

    it('rolls back to the persisted settings when the popup closes without saving', () => {
      const { rerender } = render(<SettingsPopup />);
      fireEvent.click(screen.getByText('settings.theme.dark'));
      expect(applyAppearance).toHaveBeenLastCalledWith(
        expect.objectContaining({ themeMode: 'dark' }),
      );

      state = { ...state, popupOpen: false };
      rerender(<SettingsPopup />);

      expect(applyAppearance).toHaveBeenLastCalledWith(state.current);
    });

    it('previews nothing while the popup is closed and no settings are loaded', () => {
      state = { ...state, popupOpen: false, current: null };
      render(<SettingsPopup />);
      expect(applyAppearance).not.toHaveBeenCalled();
    });
  });

  describe('open / close lifecycle', () => {
    it('stays in the DOM for the exit animation, then unmounts', () => {
      vi.useFakeTimers();
      try {
        const { rerender } = render(<SettingsPopup />);
        state = { ...state, popupOpen: false };
        rerender(<SettingsPopup />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        act(() => {
          vi.advanceTimersByTime(200);
        });
        expect(screen.queryByRole('dialog')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a re-open during the exit animation keeps the dialog mounted', () => {
      vi.useFakeTimers();
      try {
        const { rerender } = render(<SettingsPopup />);
        state = { ...state, popupOpen: false };
        rerender(<SettingsPopup />);
        act(() => {
          vi.advanceTimersByTime(100);
        });
        state = { ...state, popupOpen: true };
        rerender(<SettingsPopup />);
        act(() => {
          vi.advanceTimersByTime(500);
        });

        expect(screen.getByRole('dialog')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('discards unsaved edits: re-opening starts from the persisted settings', () => {
      vi.useFakeTimers();
      try {
        const { rerender } = render(<SettingsPopup />);
        fireEvent.click(screen.getByTestId('stub-palette-editor'));
        expect(screen.getByTestId('stub-palette-editor')).toHaveAttribute('data-keys', 'accent');

        state = { ...state, popupOpen: false };
        rerender(<SettingsPopup />);
        act(() => {
          vi.advanceTimersByTime(200);
        });
        state = { ...state, popupOpen: true };
        rerender(<SettingsPopup />);

        expect(screen.getByTestId('stub-palette-editor')).toHaveAttribute('data-keys', '');
        expect(screen.getByText('common.save')).toBeDisabled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Escape', () => {
    it('is left to a focused text field, so it does not close the popup', () => {
      render(
        <>
          <SettingsPopup />
          <input aria-label="outside" />
        </>,
      );
      fireEvent.keyDown(screen.getByLabelText('outside'), { key: 'Escape' });
      expect(dispatch).not.toHaveBeenCalledWith({ type: 'settings/closePopup' });
    });

    // The palette picker is a native <input type="color">: it keeps focus after
    // a pick, and Esc must still close (and roll back the live preview).
    it.each(['color', 'checkbox', 'range'])(
      'closes the popup from a focused <input type="%s">',
      (type) => {
        render(
          <>
            <SettingsPopup />
            <input type={type} aria-label="picker" />
          </>,
        );
        fireEvent.keyDown(screen.getByLabelText('picker'), { key: 'Escape' });
        expect(dispatch).toHaveBeenCalledWith({ type: 'settings/closePopup' });
      },
    );

    it('is left to a focused textarea', () => {
      render(
        <>
          <SettingsPopup />
          <textarea aria-label="notes" />
        </>,
      );
      fireEvent.keyDown(screen.getByLabelText('notes'), { key: 'Escape' });
      expect(dispatch).not.toHaveBeenCalledWith({ type: 'settings/closePopup' });
    });

    it('other keys do not close the popup', () => {
      render(<SettingsPopup />);
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('does not react once the popup is closed', () => {
      state = { ...state, popupOpen: false };
      render(<SettingsPopup />);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  it('a mouse-down inside the dialog does not close it', () => {
    render(<SettingsPopup />);
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'settings/closePopup' });
  });
});
