import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// The plan still open on this screen (the Memória, or one neuron's), so a reload finds it.

export async function GET(request: Request) {
  if (!(await hasSession())) return unauthorized();
  const target = new URL(request.url).searchParams.get('target') ?? '';
  if (target && !validNeuronId(target)) return Response.json(null);
  return fromCore(() => coreRequest('GET', `/plans/current${target ? `?target=${target}` : ''}`));
}
