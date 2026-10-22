import { z } from 'zod';

import type { AppSettingsPatchDTO } from '@infrastructure/electron/ipc-channels';

/**
 * Zod schema for the `settings:save` patch.
 *
 * This only pins the transport shape (known keys, primitive types, enum
 * members). Value rules — hex colours, the hotkey vocabulary — stay in the
 * domain parser that `UpdateSettingsUseCase` runs on the merged result, so
 * they are not duplicated here. `.strict()` rejects unknown keys: a renamed
 * field on one side would otherwise be dropped silently.
 */
const AppSettingsPatch = z
  .object({
    themeMode: z.enum(['system', 'dark', 'light']),
    language: z.enum(['system', 'en', 'ru']),
    palette: z.record(z.string(), z.string()),
    openDraftHotkey: z.string(),
  })
  .partial()
  .strict() satisfies z.ZodType<AppSettingsPatchDTO>;

export const SettingsSaveArgs = z.tuple([AppSettingsPatch]);
