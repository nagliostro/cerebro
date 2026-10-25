import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// Settings → Connections: removes one API connection and its key from the vault.

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  // Connection ids have the same shape as neuron ids.
  if (!validNeuronId(id)) return Response.json({ error: 'not found' }, { status: 404 });
  return fromCore(() => coreRequest('POST', `/connections/${id}/remove`));
}
