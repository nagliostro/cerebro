import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized, validPlanId } from '@/lib/server/require-session';

// Settings → Runs: stops a job that is running or waiting.

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  // Job ids have the same shape as plan ids.
  if (!validPlanId(id)) return Response.json({ error: 'not found' }, { status: 404 });
  return fromCore(() => coreRequest('POST', `/jobs/${id}/cancel`));
}
