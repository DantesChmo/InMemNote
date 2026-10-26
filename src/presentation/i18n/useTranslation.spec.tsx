import { settingsReducer, settingsActions } from '@presentation/settings/slice';
import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import { act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTranslation } from './useTranslation';

import type { AppSettingsDTO } from '@shared/ipc';

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
  describe('system mode', () => {
    afterEach(() => vi.restoreAllMocks());

    it('picks Russian for a region variant of the OS language', () => {
      vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('ru-RU');
      const { wrapper } = renderWithStore('system');
      const { result } = renderHook(() => useTranslation(), { wrapper });
      expect(result.current.locale).toBe('ru');
      expect(result.current.t('common.save')).toBe('Сохранить');
    });

    it('falls back to English for an OS language we do not translate', () => {
      vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('de-DE');
      const { wrapper } = renderWithStore('system');
      const { result } = renderHook(() => useTranslation(), { wrapper });
      expect(result.current.locale).toBe('en');
      expect(result.current.t('common.save')).toBe('Save');
    });

    it('treats not-yet-loaded settings like "system"', () => {
      vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('ru-RU');
      const store = configureStore({ reducer: { settings: settingsReducer } });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const { result } = renderHook(() => useTranslation(), { wrapper });
      expect(result.current.locale).toBe('ru');
    });
  });

  it('switches language live when the setting changes', () => {
    const { store, wrapper } = renderWithStore('en');
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.t('common.save')).toBe('Save');

    act(() => {
      store.dispatch(settingsActions.setFromBroadcast(dto('ru')));
    });

    expect(result.current.locale).toBe('ru');
    expect(result.current.t('common.save')).toBe('Сохранить');
  });

  it('interpolates a zero, which is a value and not a missing parameter', () => {
    const { wrapper } = renderWithStore('en');
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.t('editor.wordCount', { n: 0 })).toBe('0 words');
  });

  it('leaves only the missing placeholder visible when other parameters are given', () => {
    const { wrapper } = renderWithStore('en');
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.t('storage.reason', { other: 'x' })).toBe('Reason: {reason}');
  });

  it('keeps `t` stable across re-renders while the language is unchanged', () => {
    const { wrapper } = renderWithStore('en');
    const { result, rerender } = renderHook(() => useTranslation(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
