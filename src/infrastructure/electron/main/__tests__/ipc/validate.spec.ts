import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { IpcValidationError, parseIpcArgs } from '../../ipc/validate';

describe('parseIpcArgs', () => {
  const Args = z.tuple([z.string(), z.object({ width: z.number() }).optional()]);

  it('returns the parsed tuple for a valid call', () => {
    expect(parseIpcArgs('x:y', Args, ['a', { width: 1 }])).toEqual(['a', { width: 1 }]);
  });

  it('treats missing trailing optional arguments as undefined', () => {
    expect(parseIpcArgs('x:y', Args, ['a'])).toEqual(['a', undefined]);
  });

  it('rejects extra arguments', () => {
    expect(() => parseIpcArgs('x:y', Args, ['a', undefined, 'extra'])).toThrow(IpcValidationError);
  });

  it('builds a message naming the channel, argument index and field', () => {
    let caught: unknown;
    try {
      parseIpcArgs('x:y', Args, ['a', { width: 'wide' }]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(IpcValidationError);
    const err = caught as IpcValidationError;
    expect(err.name).toBe('IpcValidationError');
    expect(err.channel).toBe('x:y');
    expect(err.message).toMatch(/^Invalid IPC payload for "x:y": \[1\]\.width: /);
  });
});
