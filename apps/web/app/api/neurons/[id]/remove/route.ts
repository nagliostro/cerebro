import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// Settings → Neurons: removes a neuron for good (the screen asks first).

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!validNeuronId(id)) return Response.json({ error: 'not found' }, { status: 404 });
  return fromCore(() => coreRequest('POST', `/neurons/${id}/remove`));
}
