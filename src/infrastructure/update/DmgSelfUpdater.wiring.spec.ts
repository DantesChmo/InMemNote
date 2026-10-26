// @vitest-environment node
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';

import { AppVersion } from '@domain/update/AppVersion';
import { unwrap } from '@shared/Result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDmgSelfUpdater, nodeSpawnDetached } from './DmgSelfUpdater';

import type { ReleaseInfo } from '@domain/update/ReleaseInfo';
import type * as ChildProcessModule from 'node:child_process';
import type { AddressInfo } from 'node:net';
import type * as OsModule from 'node:os';

/**
 * Exercises the REAL download / spawn wiring behind `createDmgSelfUpdater`
 * (the part the injected-deps spec cannot reach) against a throw-away local
 * HTTP server. Only two process-level edges are replaced:
 *   - `child_process.spawn`: the real helper waits on our PID and then tries to
 *     swap /Applications/Inmemnote.app, which must never happen from a test;
 *   - `os.tmpdir`: so the DMG and script land in a per-test directory.
 * The shell helper itself is covered by the sandboxed specs in
 * `DmgSelfUpdater.spec.ts`.
 */

const state = vi.hoisted(() => ({
  tmp: '',
  realTmpdir: (() => '') as () => string,
  quit: vi.fn(),
  spawned: [] as { command: string; args: string[]; options: Record<string, unknown> }[],
  /** Called for every spawn; decides how the fake child behaves. */
  behave: (_child: FakeChild): void => undefined,
}));

class FakeChild extends EventEmitter {
  public unrefd = false;
  public unref(): void {
    this.unrefd = true;
  }
}

vi.mock('electron', () => ({ app: { quit: state.quit } }));

vi.mock('node:os', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof OsModule;
  state.realTmpdir = actual.tmpdir;
  return { ...actual, default: actual, tmpdir: () => state.tmp };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ChildProcessModule;
  const spawn = (command: string, args: string[], options: Record<string, unknown>) => {
    state.spawned.push({ command, args, options });
    const child = new FakeChild();
    queueMicrotask(() => state.behave(child));
    return child;
  };
  return { ...actual, default: { ...actual, spawn }, spawn };
});

const BODY_SIZE = 4000;
const CHUNK = 1000;

let server: Server;
let baseUrl: string;
let route: (req: IncomingMessage, res: ServerResponse) => void;

const releaseAt = (path: string): ReleaseInfo => ({
  version: unwrap(AppVersion.create('0.6.0')),
  downloadUrl: `${baseUrl}${path}`,
  notesUrl: 'https://example.test/0.6.0',
});

/** Send `BODY_SIZE` bytes in `CHUNK`-sized writes, pausing so each is its own TCP segment. */
async function sendInChunks(
  res: ServerResponse,
  opts: { announceLength: boolean; stopAfter?: number },
): Promise<void> {
  res.writeHead(200, opts.announceLength ? { 'content-length': String(BODY_SIZE) } : {});
  const total = opts.stopAfter ?? BODY_SIZE;
  for (let sent = 0; sent < total; sent += CHUNK) {
    res.write(Buffer.alloc(CHUNK, 1));
    await new Promise((r) => setTimeout(r, 15));
  }
}

beforeEach(async () => {
  state.tmp = mkdtempSync(join(state.realTmpdir(), 'inmemnote-updater-'));
  state.quit.mockClear();
  state.spawned.length = 0;
  state.behave = (child) => void child.emit('spawn');
  route = (_req, res) => void sendInChunks(res, { announceLength: true }).then(() => res.end());
  server = createServer((req, res) => route(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  rmSync(state.tmp, { recursive: true, force: true });
});

describe('createDmgSelfUpdater (real download + spawn wiring)', () => {
  it('streams the DMG to disk, then spawns the helper un-tethered and quits', async () => {
    await createDmgSelfUpdater().install(releaseAt('/a.dmg'));

    const dmg = join(state.tmp, 'Inmemnote-update.dmg');
    expect(statSync(dmg).size).toBe(BODY_SIZE);
    const script = join(state.tmp, 'inmemnote-update.sh');
    expect(readFileSync(script, 'utf8')).toMatch(/^#!\/bin\/bash/);
    expect(statSync(script).mode & 0o111).not.toBe(0);
    expect(state.spawned).toEqual([
      {
        command: '/bin/bash',
        args: [script, String(process.pid), dmg],
        options: { detached: true, stdio: 'ignore' },
      },
    ]);
    expect(state.quit).toHaveBeenCalledOnce();
  });

  describe('download progress', () => {
    it('is reported as a non-decreasing fraction in (0, 1] that ends at exactly 1', async () => {
      const seen: number[] = [];
      await createDmgSelfUpdater((f) => seen.push(f)).install(releaseAt('/a.dmg'));

      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((f) => f > 0 && f <= 1)).toBe(true);
      expect(seen).toEqual([...seen].sort((a, b) => a - b));
      expect(seen.at(-1)).toBe(1);
    });

    it('is not reported when the server announces no Content-Length, yet the install succeeds', async () => {
      route = (_req, res) =>
        void sendInChunks(res, { announceLength: false }).then(() => res.end());
      const seen: number[] = [];

      await createDmgSelfUpdater((f) => seen.push(f)).install(releaseAt('/a.dmg'));

      expect(seen).toEqual([]);
      expect(statSync(join(state.tmp, 'Inmemnote-update.dmg')).size).toBe(BODY_SIZE);
      expect(state.quit).toHaveBeenCalledOnce();
    });
  });

  describe('failures leave the running app alone', () => {
    const expectNothingStarted = () => {
      expect(state.spawned).toEqual([]);
      expect(state.quit).not.toHaveBeenCalled();
      expect(existsSync(join(state.tmp, 'inmemnote-update.sh'))).toBe(false);
    };

    it('rejects on an HTTP error status, naming it', async () => {
      route = (_req, res) => void res.writeHead(404).end();

      await expect(createDmgSelfUpdater().install(releaseAt('/gone.dmg'))).rejects.toThrow(
        /HTTP 404/,
      );
      expectNothingStarted();
    });

    it('follows a redirect to the DMG (GitHub serves release assets from a CDN)', async () => {
      route = (req, res) => {
        if (req.url === '/latest.dmg') {
          res.writeHead(302, { location: '/cdn/real.dmg' }).end();
          return;
        }
        void sendInChunks(res, { announceLength: true }).then(() => res.end());
      };

      await createDmgSelfUpdater().install(releaseAt('/latest.dmg'));

      expect(statSync(join(state.tmp, 'Inmemnote-update.dmg')).size).toBe(BODY_SIZE);
      expect(state.quit).toHaveBeenCalledOnce();
    });

    it('rejects when the redirect target is an error', async () => {
      route = (req, res) => {
        if (req.url === '/latest.dmg') {
          res.writeHead(302, { location: '/cdn/expired.dmg' }).end();
          return;
        }
        res.writeHead(403).end();
      };

      await expect(createDmgSelfUpdater().install(releaseAt('/latest.dmg'))).rejects.toThrow(
        /HTTP 403/,
      );
      expectNothingStarted();
    });

    it('rejects when the connection drops mid-download', async () => {
      // Content-Length promises 4000 bytes; the server dies after ~2000.
      route = (_req, res) =>
        void sendInChunks(res, { announceLength: true, stopAfter: 2 * CHUNK }).then(() =>
          res.destroy(),
        );
      const seen: number[] = [];

      await expect(
        createDmgSelfUpdater((f) => seen.push(f)).install(releaseAt('/a.dmg')),
      ).rejects.toThrow();

      expectNothingStarted();
      // Progress never claimed completion for a download that did not finish.
      expect(seen.every((f) => f < 1)).toBe(true);
    });

    describe('with a published checksum', () => {
      const bodySha = createHash('sha256').update(Buffer.alloc(BODY_SIZE, 1)).digest('hex');
      const withChecksum = (path: string): ReleaseInfo => ({
        ...releaseAt('/a.dmg'),
        checksumUrl: `${baseUrl}${path}`,
      });
      const serveChecksum = (digest: string): void => {
        const download = route;
        route = (req, res) => {
          if (req.url === '/a.dmg.sha256') res.end(`${digest}  Inmemnote-macos-arm64.dmg\n`);
          else download(req, res);
        };
      };

      it('installs when the downloaded bytes hash to the published digest', async () => {
        serveChecksum(bodySha);
        await createDmgSelfUpdater().install(withChecksum('/a.dmg.sha256'));
        expect(state.quit).toHaveBeenCalledOnce();
      });

      it('deletes a corrupted DMG from disk and never starts the helper', async () => {
        serveChecksum('0'.repeat(64));

        await expect(createDmgSelfUpdater().install(withChecksum('/a.dmg.sha256'))).rejects.toThrow(
          /checksum mismatch/i,
        );

        expect(existsSync(join(state.tmp, 'Inmemnote-update.dmg'))).toBe(false);
        expectNothingStarted();
      });

      it('fails before downloading when the checksum file is not served', async () => {
        const requested: string[] = [];
        route = (req, res) => {
          requested.push(req.url ?? '');
          res.writeHead(404).end();
        };

        await expect(
          createDmgSelfUpdater().install(withChecksum('/missing.sha256')),
        ).rejects.toThrow(/Checksum download failed: HTTP 404/);

        expect(requested).toEqual(['/missing.sha256']);
        expectNothingStarted();
      });
    });

    it('rejects and does NOT quit when the helper process cannot be started (bug #04)', async () => {
      state.behave = (child) =>
        void child.emit(
          'error',
          Object.assign(new Error('spawn /bin/bash EACCES'), { code: 'EACCES' }),
        );

      await expect(createDmgSelfUpdater().install(releaseAt('/a.dmg'))).rejects.toThrow(/EACCES/);

      expect(state.spawned).toHaveLength(1);
      expect(state.quit).not.toHaveBeenCalled();
    });
  });
});

describe('nodeSpawnDetached', () => {
  it('detaches the child from this process: own session, no stdio, unref-ed', async () => {
    let child!: FakeChild;
    state.behave = (c) => {
      child = c;
      c.emit('spawn');
    };

    await nodeSpawnDetached('/bin/bash', ['x']);

    expect(state.spawned[0]!.options).toEqual({ detached: true, stdio: 'ignore' });
    expect(child.unrefd).toBe(true);
  });

  it('survives an error event that arrives after the spawn event (no uncaught exception)', async () => {
    let child!: FakeChild;
    state.behave = (c) => {
      child = c;
      c.emit('spawn');
    };
    await nodeSpawnDetached('/bin/bash', []);

    // An EventEmitter throws on an 'error' with no listener — that would crash
    // the main process after the update flow already considered itself done.
    expect(() => child.emit('error', new Error('late'))).not.toThrow();
  });
});
