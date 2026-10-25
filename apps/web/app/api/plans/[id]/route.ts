import { coreRequest } from '@cerebro/dominus/client';

import { fromCore, hasSession, unauthorized, validPlanId } from '@/lib/server/require-session';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!validPlanId(id)) return Response.json({ error: 'not found' }, { status: 404 });
  return fromCore(() => coreRequest('GET', `/plans/${id}`));
}
