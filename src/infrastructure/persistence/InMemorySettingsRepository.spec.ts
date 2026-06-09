// Regression tests for the in-memory settings repository.
import { describe, expect, it } from 'vitest';

import { AppSettingsParse } from '@domain/settings/AppSettings';
import { unwrap } from '@shared/Result';

import { InMemorySettingsRepository } from './InMemorySettingsRepository';

describe('InMemorySettingsRepository', () => {
  it('load returns null before any save (first-launch contract)', async () => {
    expect(await new InMemorySettingsRepository().load()).toBeNull();
  });

  it('round-trips the same AppSettings instance', async () => {
    const repo = new InMemorySettingsRepository();
    const settings = unwrap(AppSettingsParse.fromPlain({ themeMode: 'dark', language: 'ru' }));

    await repo.save(settings);

    expect(await repo.load()).toBe(settings);
  });

  it('save overwrites the cached settings (last write wins)', async () => {
    const repo = new InMemorySettingsRepository();
    const a = unwrap(AppSettingsParse.fromPlain({ themeMode: 'dark' }));
    const b = unwrap(AppSettingsParse.fromPlain({ themeMode: 'light' }));

    await repo.save(a);
    await repo.save(b);

    expect((await repo.load())?.themeMode).toBe('light');
  });
});
