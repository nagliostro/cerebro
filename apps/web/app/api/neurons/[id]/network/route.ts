import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// The globe of a neuron's screen: the sites its application may reach, or asks to; the owner
// allows or takes one away. Only the owner's page reaches this, never the application's bridge.

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!validNeuronId(id)) return notFound();
  return fromCore(() => coreRequest('GET', `/neurons/${id}/network`));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!validNeuronId(id)) return notFound();
  const b = (await request.json().catch(() => null)) as { host?: unknown; allow?: unknown } | null;
  return fromCore(() =>
    coreRequest('POST', `/neurons/${id}/network`, { host: b?.host, allow: b?.allow }),
  );
}
