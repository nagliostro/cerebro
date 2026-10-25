import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// Settings → Neurons: a neuron's name or role.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!validNeuronId(id)) return Response.json({ error: 'not found' }, { status: 404 });
  const b = (await request.json().catch(() => null)) as { name?: unknown; role?: unknown } | null;
  return fromCore(() =>
    coreRequest('POST', `/neurons/${id}/edit`, { name: b?.name, role: b?.role }),
  );
}
