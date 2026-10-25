import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// Who may ask what of a neuron. Only the owner's own page reaches this (session and same origin);
// the applications' bridge has no way here.

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!validNeuronId(id)) return notFound();
  return fromCore(() => coreRequest('GET', `/neurons/${id}/permissions`));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!validNeuronId(id)) return notFound();
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const body =
    b?.revokeAll === true
      ? { revokeAll: true }
      : { caller: b?.caller, collection: b?.collection, grants: b?.grants };
  return fromCore(() => coreRequest('POST', `/neurons/${id}/permissions`, body));
}
