import { AppSettings } from '@domain/settings/AppSettings';
import { InMemorySettingsRepository } from '@infrastructure/persistence/InMemorySettingsRepository';
import { describe, expect, it } from 'vitest';

import { LoadSettingsUseCase } from './LoadSettingsUseCase';

describe('LoadSettingsUseCase', () => {
  it('returns the stored settings when present', async () => {
    const repo = new InMemorySettingsRepository();
    const saved = AppSettings.default().withThemeMode('dark');
    await repo.save(saved);

    const result = await new LoadSettingsUseCase(repo).execute();
    expect(result.themeMode).toBe('dark');
  });

  it('returns defaults on first launch (empty repo)', async () => {
    const result = await new LoadSettingsUseCase(new InMemorySettingsRepository()).execute();
    expect(result.themeMode).toBe('system');
    expect(result.openDraftHotkey.accelerator).toBe('CommandOrControl+Shift+Space');
    expect(result.palette.isEmpty()).toBe(true);
  });
});
