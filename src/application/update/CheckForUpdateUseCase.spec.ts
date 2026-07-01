import { AppVersion } from '@domain/update/AppVersion';
import { unwrap } from '@shared/Result';
import { describe, expect, it } from 'vitest';

import { CheckForUpdateUseCase } from './CheckForUpdateUseCase';

import type { ReleaseGateway } from '@domain/update/ReleaseGateway';
import type { ReleaseInfo } from '@domain/update/ReleaseInfo';

const version = (raw: string): AppVersion => unwrap(AppVersion.create(raw));

const release = (raw: string): ReleaseInfo => ({
  version: version(raw),
  downloadUrl: `https://example.test/${raw}.dmg`,
  notesUrl: `https://example.test/${raw}`,
});

const gatewayReturning = (info: ReleaseInfo): ReleaseGateway => ({
  fetchLatest: async () => info,
});

describe('CheckForUpdateUseCase', () => {
  it('returns the release when the feed is newer than the running app', async () => {
    const uc = new CheckForUpdateUseCase(gatewayReturning(release('0.6.0')), version('0.5.0'));
    const result = await uc.execute();
    expect(unwrap(result)?.version.toString()).toBe('0.6.0');
  });

  it('returns null when the running app is already the latest', async () => {
    const uc = new CheckForUpdateUseCase(gatewayReturning(release('0.5.0')), version('0.5.0'));
    expect(unwrap(await uc.execute())).toBeNull();
  });

  it('returns null when the running app is somehow ahead of the feed', async () => {
    const uc = new CheckForUpdateUseCase(gatewayReturning(release('0.4.0')), version('0.5.0'));
    expect(unwrap(await uc.execute())).toBeNull();
  });

  it('maps a gateway failure to a soft UPDATE_CHECK_FAILED error', async () => {
    const gateway: ReleaseGateway = {
      fetchLatest: async () => {
        throw new Error('offline');
      },
    };
    const uc = new CheckForUpdateUseCase(gateway, version('0.5.0'));
    const result = await uc.execute();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UPDATE_CHECK_FAILED');
  });
});
