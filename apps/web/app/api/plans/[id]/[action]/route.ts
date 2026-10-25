import { coreRequest } from '@/lib/server/core';

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
  const b = (await request.json().catch(() => ({}))) as { text?: unknown; improvements?: unknown };
  // Accepting a copy: the improvements the owner ticked, by their order in the research.
  const improvements = Array.isArray(b.improvements)
    ? b.improvements.filter((i) => Number.isInteger(i)).slice(0, 10)
    : [];
  const body = action === 'answer' ? { text: b.text } : action === 'accept' ? { improvements } : {};
  return fromCore(() => coreRequest('POST', `/plans/${id}/${action}`, body));
}
