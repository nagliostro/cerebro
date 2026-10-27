import { coreRequest } from '@/lib/server/core';

import { pickLocale } from '@/lib/i18n';
import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// The conversation with a neuron: what was said (GET), and something new (POST). The core tells
// a question (answered) from a change (a plan); this only checks the session and passes it on.

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!validNeuronId(id)) return Response.json([]);
  return fromCore(() => coreRequest('GET', `/neurons/${id}/talk`));
}

export async function POST(request: Request, { params }: Params) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!validNeuronId(id)) return Response.json({ error: 'not found' }, { status: 404 });
  const b = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const locale = pickLocale(request.headers.get('accept-language'));
  return fromCore(() => coreRequest('POST', `/neurons/${id}/talk`, { text: b?.text, locale }));
}
