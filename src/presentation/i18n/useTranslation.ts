import { useAppSelector } from '@presentation/app/store';
import { useMemo } from 'react';

import { resolveLocale } from './resolveLocale';
import { en } from './translations.en';
import { ru } from './translations.ru';

import type { MessageKey, MessageParams, Messages } from './messages';
import type { Locale } from '@domain/settings/LanguageMode';

const DICTIONARIES: Record<Locale, Messages> = { en, ru };

/**
 * Hook returning the active `t(...)` function plus the resolved locale.
 *
 * Resolution chain: settings.language → `resolveLocale` → dictionary lookup.
 * When the user picks `'system'`, this hook re-renders only when the Redux
 * store flips the language field — `navigator.language` itself doesn't
 * change at runtime, so re-evaluating it on every render is wasted work.
 *
 * Interpolation: `{name}` placeholders are replaced positionally by name.
 * Missing parameters render as the literal placeholder so a forgotten arg
 * is loud (and clearly mapped to the offending key) at review time.
 */
export interface Translator {
  t: (key: MessageKey, params?: MessageParams) => string;
  locale: Locale;
}

const PLACEHOLDER_RE = /\{(\w+)\}/g;

function format(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER_RE, (_, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}

export function useTranslation(): Translator {
  const language = useAppSelector((s) => s.settings.current?.language);

  return useMemo<Translator>(() => {
    const locale = resolveLocale(language);
    const dict = DICTIONARIES[locale];
    return {
      t: (key, params) => format(dict[key], params),
      locale,
    };
  }, [language]);
}
