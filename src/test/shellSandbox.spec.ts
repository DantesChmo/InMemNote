// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShellSandbox, type ShellSandbox } from './shellSandbox';

describe('createShellSandbox().run', () => {
  let sb: ShellSandbox;
  beforeEach(() => (sb = createShellSandbox()));
  afterEach(() => sb.cleanup());

  const script = (body: string): string => {
    const path = join(sb.root, 'probe.sh');
    writeFileSync(path, `#!/bin/bash\n${body}\n`);
    return path;
  };

  it('refuses a script that hardcodes /Applications', () => {
    expect(() => sb.run(script('echo "/Applications/Inmemnote.app"'), [])).toThrow(/hardcodes/);
  });

  it('allows /Applications as an override default and in comments', () => {
    const res = sb.run(script('# installs into /Applications\ndest="${3:-/Applications}"'), []);
    expect(res.status).toBe(0);
  });
});
