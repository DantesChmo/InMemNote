import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { settingsDTO } from '../../test/mockInmemnoteApi';

import { SettingsPopup } from './SettingsPopup';

import type { AppSettingsDTO } from '@infrastructure/electron/ipc-channels';

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
});
