import { cookies } from 'next/headers';

import { isValidSession, SESSION_COOKIE } from './session';

/**
 * Every route that reads or changes the owner's things checks the session itself, besides the
 * proxy (Next's guidance: a matcher change must never leave a route open).
 */
export async function hasSession(): Promise<boolean> {
  return isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
}

export const unauthorized = () => Response.json({ error: 'unauthorized' }, { status: 401 });

/** The core's answer, or its error with the same status, for a route that forwards to it. */
export async function fromCore(run: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await run());
  } catch (e) {
    const message = (e as Error).message;
    const status = Number(message.match(/core answered (\d{3})/)?.[1] ?? 502);
    return Response.json({ error: message.replace(/^core answered \d{3}: /, '') }, { status });
  }
}

export const validNeuronId = (id: string) => /^[a-z0-9-]{1,40}$/.test(id);

export const validPlanId = (id: string) => /^[\w-]{1,40}$/.test(id);
