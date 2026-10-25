import path from 'node:path';

import { coreRequest as request, CoreUnavailable, ensureCore } from '@cerebro/dominus/client';

// The screens' way to the Dominus core. The core is a process of its own; if it went away (a
// crash, the owner closed it), the first request that finds it gone starts it again and tries
// once more, so the Cerebro never stays without it until a restart.

// The server always runs from apps/web (pnpm and the tests start it there).
export const CORE_FILE = path.join(
  process.cwd(),
  '..',
  '..',
  'packages',
  'dominus',
  'src',
  'core.ts',
);

let reviving: Promise<boolean> | null = null;

/** Starts the core if it is not running; one start at a time, however many ask. */
export function reviveCore(): Promise<boolean> {
  reviving ??= ensureCore(CORE_FILE).finally(() => (reviving = null));
  return reviving;
}

export async function coreRequest<T>(
  method: 'GET' | 'POST',
  route: string,
  body?: unknown,
): Promise<T> {
  try {
    return await request<T>(method, route, body);
  } catch (e) {
    if (!(e instanceof CoreUnavailable) || !(await reviveCore())) throw e;
    return request<T>(method, route, body);
  }
}
