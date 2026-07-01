import { AppVersion } from '@domain/update/AppVersion';
import { unwrap } from '@shared/Result';
import { describe, expect, it, vi } from 'vitest';

import { InstallUpdateUseCase } from './InstallUpdateUseCase';

import type { ReleaseInfo } from '@domain/update/ReleaseInfo';
import type { UpdateInstaller } from '@domain/update/UpdateInstaller';

const release: ReleaseInfo = {
  version: unwrap(AppVersion.create('0.6.0')),
  downloadUrl: 'https://example.test/0.6.0.dmg',
  notesUrl: 'https://example.test/0.6.0',
};

describe('InstallUpdateUseCase', () => {
  it('delegates to the installer with the release', async () => {
    const install = vi.fn(async () => undefined);
    const installer: UpdateInstaller = { install };
    const result = await new InstallUpdateUseCase(installer).execute(release);
    expect(result.ok).toBe(true);
    expect(install).toHaveBeenCalledWith(release);
  });

  it('maps an installer throw to UPDATE_INSTALL_FAILED', async () => {
    const installer: UpdateInstaller = {
      install: async () => {
        throw new Error('hdiutil exploded');
      },
    };
    const result = await new InstallUpdateUseCase(installer).execute(release);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UPDATE_INSTALL_FAILED');
      expect(result.error.message).toContain('hdiutil exploded');
    }
  });
});
