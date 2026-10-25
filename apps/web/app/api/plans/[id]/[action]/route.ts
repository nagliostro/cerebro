import { coreRequest } from '@cerebro/dominus/client';

import { fromCore, hasSession, unauthorized, validPlanId } from '@/lib/server/require-session';

// What the owner does with a plan: answer its questions or ask for changes, accept (build),
// reject, stop what is running, or take an adjustment back.

const ACTIONS = new Set(['answer', 'accept', 'reject', 'cancel', 'undo']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  if (!(await hasSession())) return unauthorized();
  const { id, action } = await params;
  if (!validPlanId(id) || !ACTIONS.has(action))
    return Response.json({ error: 'not found' }, { status: 404 });
  const b = (await request.json().catch(() => ({}))) as { text?: unknown };
  return fromCore(() =>
    coreRequest('POST', `/plans/${id}/${action}`, action === 'answer' ? { text: b.text } : {}),
  );
}
