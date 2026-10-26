import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// The requests already made, newest first; with ?neuron=, only that neuron's (its adjustments
// window shows them).

type Entry = { target: string | null; neuron: string | null };

export async function GET(request: Request) {
  if (!(await hasSession())) return unauthorized();
  const neuron = new URL(request.url).searchParams.get('neuron') ?? '';
  if (neuron && !validNeuronId(neuron)) return Response.json([]);
  return fromCore(async () => {
    const list = await coreRequest<Entry[]>('GET', '/plans/history');
    return neuron ? list.filter((e) => e.target === neuron || e.neuron === neuron) : list;
  });
}
