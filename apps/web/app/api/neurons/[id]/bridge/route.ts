import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// The bridge's server side: what a neuron's application asked through the Cerebro page. Only two
// kinds pass, its own data and a call to another neuron through the contract; the core checks the
// rest (formats, permissions). Permissions themselves are never reachable from here.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!validNeuronId(id)) return Response.json({ error: 'not found' }, { status: 404 });
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (b?.kind === 'data')
    return fromCore(() =>
      coreRequest('POST', `/neurons/${id}/data`, {
        collection: b.collection,
        op: b.op,
        input: b.input,
      }),
    );
  if (b?.kind === 'call')
    return fromCore(() =>
      coreRequest('POST', `/neurons/${id}/call`, {
        target: b.target,
        operation: b.operation,
        input: b.input,
      }),
    );
  return Response.json({ error: 'unknown request' }, { status: 400 });
}
