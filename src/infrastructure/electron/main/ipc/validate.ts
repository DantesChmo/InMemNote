import type { z } from 'zod';

/**
 * Trust boundary for renderer → main IPC.
 *
 * The renderer is treated as untrusted input (a compromised page, a stale
 * preload, a typo in a slice): every `ipcMain.handle` callback runs its raw
 * argument list through a Zod tuple schema before anything reaches a
 * use-case or the window controller. A bad payload becomes an
 * `IpcValidationError` — Electron forwards its message to the renderer as a
 * rejected `invoke()` promise, so the caller sees *which* channel and *which*
 * argument was wrong instead of a crash deep inside the domain or SQLite.
 */
export class IpcValidationError extends Error {
  override readonly name = 'IpcValidationError';

  constructor(
    readonly channel: string,
    readonly issues: readonly z.ZodIssue[],
  ) {
    super(`Invalid IPC payload for "${channel}": ${issues.map(formatIssue).join('; ')}`);
  }
}

function formatIssue(issue: z.ZodIssue): string {
  // Tuple paths start with the argument index, so `[1].width` reads as
  // "second argument, field width".
  const path = issue.path
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? p : `.${p}`))
    .join('');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * Validate a handler's positional arguments against a tuple schema.
 *
 * Zod 3 tuples demand exactly `items.length` elements, even when the
 * trailing items are `.optional()`. `ipcRenderer.invoke(ch, id)` and
 * `invoke(ch, id, undefined)` are the same call to the renderer, so we pad
 * missing trailing arguments with `undefined` before parsing. Extra arguments
 * are still rejected — a longer call than the contract means drift.
 */
export function parseIpcArgs<T extends z.ZodTuple>(
  channel: string,
  schema: T,
  args: readonly unknown[],
): z.output<T> {
  const arity = schema.items.length;
  const padded =
    args.length < arity ? [...args, ...Array(arity - args.length).fill(undefined)] : args;
  const result = schema.safeParse(padded);
  if (!result.success) throw new IpcValidationError(channel, result.error.issues);
  return result.data;
}
