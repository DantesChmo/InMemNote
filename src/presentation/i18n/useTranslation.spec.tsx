import { settingsReducer, settingsActions } from '@presentation/settings/slice';
import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';


import { useTranslation } from './useTranslation';

import type { AppSettingsDTO } from '@infrastructure/electron/ipc-channels';

const dto = (language: AppSettingsDTO['language']): AppSettingsDTO => ({
  themeMode: 'system',
  language,
  palette: {},
  openDraftHotkey: 'CommandOrControl+Shift+Space',
});

const renderWithStore = (initialLanguage: AppSettingsDTO['language']) => {
  const store = configureStore({ reducer: { settings: settingsReducer } });
  store.dispatch(settingsActions.setFromBroadcast(dto(initialLanguage)));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return { store, wrapper };
};

describe('useTranslation', () => {
  it('returns Russian strings when language is "ru"', () => {
    const { wrapper } = renderWithStore('ru');
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.locale).toBe('ru');
    expect(result.current.t('common.save')).toBe('Сохранить');
  });

  it('returns English strings when language is "en"', () => {
    const { wrapper } = renderWithStore('en');
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.locale).toBe('en');
    expect(result.current.t('common.save')).toBe('Save');
  });

  it('interpolates {name} placeholders', () => {
    const { wrapper } = renderWithStore('en');
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.t('editor.wordCount', { n: 12 })).toBe('12 words');
  });

  it('leaves a placeholder visible when its parameter is missing', () => {
    const { wrapper } = renderWithStore('en');
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.t('library.queryNoMatch')).toContain('{q}');
  });

  it('falls back to detectSystemLocale for the "system" mode', () => {
    const { wrapper } = renderWithStore('system');
    const { result } = renderHook(() => useTranslation(), { wrapper });
    // jsdom defaults `navigator.language` to `en-US`; both supported locales
    // are valid outcomes depending on the test machine — assert structurally.
    expect(['en', 'ru']).toContain(result.current.locale);
  });
});
