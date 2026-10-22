/**
 * Throwaway filesystem + fake macOS tools for exercising the install/update
 * shell scripts on any POSIX host (CI unit tests run on Linux).
 *
 * A "DMG" here is just a directory holding `Inmemnote.app`. The fake
 * `hdiutil attach` replaces the requested mount point with a symlink to that
 * directory, so the script under test reads the fixture through the mount path
 * exactly as it would read a real image — including failing on unreadable
 * files, which is how a mid-copy failure is simulated.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const realMv = spawnSync('/bin/bash', ['-c', 'command -v mv'], { encoding: 'utf8' }).stdout.trim();

const FAKES: Record<string, string> = {
  hdiutil: `#!/bin/bash
case "$1" in
  attach)
    src="$2"; mount=""
    while [[ $# -gt 0 ]]; do [[ "$1" == -mountpoint ]] && mount="$2"; shift; done
    [[ -d "$src" ]] || { echo "hdiutil: image not recognized" >&2; exit 1; }
    rmdir "$mount" 2>/dev/null || true
    ln -s "$src" "$mount"
    ;;
esac
exit 0
`,
  open: `#!/bin/bash
echo "$*" >> "$FAKE_OPEN_LOG"
`,
  xattr: `#!/bin/bash
exit 0
`,
  // Ignores the URL: "downloads" the fixture DMG named by $FAKE_DMG.
  curl: `#!/bin/bash
dest=""
while [[ $# -gt 0 ]]; do [[ "$1" == -o ]] && dest="$2"; shift; done
cp -R "$FAKE_DMG" "$dest"
`,
  uname: `#!/bin/bash
case "$1" in -s) echo Darwin ;; -m) echo arm64 ;; esac
`,
  // Pass-through, except it fails when the source's basename matches
  // $FAKE_MV_FAIL_SRC — lets a test break one specific rename.
  mv: `#!/bin/bash
if [[ -n "\${FAKE_MV_FAIL_SRC:-}" && "$(basename "$1")" == $FAKE_MV_FAIL_SRC ]]; then
  echo "mv: simulated failure" >&2
  exit 1
fi
exec ${realMv} "$@"
`,
};

export interface ShellSandbox {
  readonly root: string;
  /** Install directory standing in for `/Applications`. */
  readonly dest: string;
  /** Write `<dir>/Inmemnote.app` whose Info.plist holds `marker`. */
  makeBundle(dir: string, marker: string): string;
  /** Marker of the bundle installed in `dest`, or null if there is none. */
  installedMarker(): string | null;
  /** Lines the fake `open` was called with. */
  opened(): string[];
  run(script: string, args: string[], env?: Record<string, string>): SpawnSyncReturns<string>;
  cleanup(): void;
}

export function createShellSandbox(): ShellSandbox {
  const root = mkdtempSync(join(tmpdir(), 'inmemnote-sh-'));
  const bin = join(root, 'bin');
  const dest = join(root, 'Applications');
  const openLog = join(root, 'open.log');
  mkdirSync(bin);
  mkdirSync(dest);
  for (const [name, body] of Object.entries(FAKES)) {
    writeFileSync(join(bin, name), body, { mode: 0o755 });
  }

  return {
    root,
    dest,
    makeBundle(dir, marker) {
      const contents = join(dir, 'Inmemnote.app', 'Contents');
      mkdirSync(contents, { recursive: true });
      writeFileSync(join(contents, 'Info.plist'), marker);
      return join(dir, 'Inmemnote.app');
    },
    installedMarker() {
      try {
        return readFileSync(join(dest, 'Inmemnote.app', 'Contents', 'Info.plist'), 'utf8');
      } catch {
        return null;
      }
    },
    opened() {
      try {
        return readFileSync(openLog, 'utf8').trim().split('\n');
      } catch {
        return [];
      }
    },
    run(script, args, env = {}) {
      assertNoHardcodedApplications(script);
      return spawnSync('/bin/bash', [script, ...args], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          FAKE_OPEN_LOG: openLog,
          ...env,
        },
      });
    },
    cleanup() {
      // Restore permissions a test may have revoked so the tree is removable.
      spawnSync('chmod', ['-R', 'u+rwX', root]);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/**
 * Refuse to run a script that could reach the real `/Applications`.
 *
 * The scripts under test replace `/Applications/Inmemnote.app` for real. The
 * sandbox only redirects them through an install-dir override, so a script
 * that ignores the override (e.g. an older revision during a TDD red run)
 * would delete the developer's installed app. The only allowed mention of
 * `/Applications` outside comments is the override's default, `:-/Applications}`.
 */
function assertNoHardcodedApplications(script: string): void {
  const code = readFileSync(script, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
    .replaceAll(':-/Applications}', '');
  if (code.includes('/Applications')) {
    throw new Error(`${script} hardcodes /Applications; refusing to run it outside a sandbox`);
  }
}

/** Make a file unreadable so any `cp` of its bundle fails half-way. */
export function makeUnreadable(path: string): void {
  chmodSync(path, 0o000);
}

/** A PID that has certainly exited, so a "wait for PID" loop returns at once. */
export function deadPid(): string {
  return String(spawnSync('true').pid);
}
