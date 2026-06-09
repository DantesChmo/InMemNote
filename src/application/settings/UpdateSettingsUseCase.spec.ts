import { AppSettings } from '@domain/settings/AppSettings';
import { InMemorySettingsRepository } from '@infrastructure/persistence/InMemorySettingsRepository';
import { describe, expect, it } from 'vitest';

import { UpdateSettingsUseCase } from './UpdateSettingsUseCase';

describe('UpdateSettingsUseCase', () => {
  it('persists a valid full payload and returns the parsed aggregate', async () => {
    const repo = new InMemorySettingsRepository();
    const useCase = new UpdateSettingsUseCase(repo);

    const result = await useCase.execute({
      themeMode: 'dark',
      palette: { accent: '#aabbcc' },
      openDraftHotkey: 'CommandOrControl+J',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.themeMode).toBe('dark');
      expect(result.value.palette.get('accent')).toBe('#aabbcc');
      expect(result.value.openDraftHotkey.accelerator).toBe('CommandOrControl+J');
    }

    const reloaded = await repo.load();
    expect(reloaded?.themeMode).toBe('dark');
  });

  it('rejects an invalid theme value without touching storage', async () => {
    const repo = new InMemorySettingsRepository();
    const preExisting = AppSettings.default().withThemeMode('dark');
    await repo.save(preExisting);

    const result = await new UpdateSettingsUseCase(repo).execute({
      themeMode: 'sepia',
    });
    expect(result.ok).toBe(false);

    // Pre-existing row stays intact — no partial writes.
    const reloaded = await repo.load();
    expect(reloaded?.themeMode).toBe('dark');
  });

  it('rejects an invalid hotkey value without touching storage', async () => {
    const repo = new InMemorySettingsRepository();
    const result = await new UpdateSettingsUseCase(repo).execute({
      openDraftHotkey: 'CommandOrControl++',
    });
    expect(result.ok).toBe(false);
    expect(await repo.load()).toBeNull();
  });

  it('rejects an invalid palette color without touching storage', async () => {
    const repo = new InMemorySettingsRepository();
    const result = await new UpdateSettingsUseCase(repo).execute({
      palette: { accent: 'not-a-color' },
    });
    expect(result.ok).toBe(false);
    expect(await repo.load()).toBeNull();
  });

  it('saves an already-validated aggregate via executeDirect', async () => {
    const repo = new InMemorySettingsRepository();
    const saved = await new UpdateSettingsUseCase(repo).executeDirect(
      AppSettings.default().withThemeMode('light'),
    );
    expect(saved.themeMode).toBe('light');
    expect((await repo.load())?.themeMode).toBe('light');
  });
});
