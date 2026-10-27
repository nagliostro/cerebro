import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// The history of a neuron's screen: what the Dominus did with it. Read only.

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!validNeuronId(id)) return Response.json({ error: 'not found' }, { status: 404 });
  return fromCore(() => coreRequest('GET', `/neurons/${id}/uses`));
}
