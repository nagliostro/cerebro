import { cookies } from 'next/headers';

import { hasSession, unauthorized } from '@/lib/server/require-session';
import { listSessions, SESSION_COOKIE, sessionId } from '@/lib/server/session';

// The devices that can enter, with which one is asking.

export async function GET() {
  if (!(await hasSession())) return unauthorized();
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  const current = sessionId(token);
  return Response.json((await listSessions()).map((s) => ({ ...s, current: s.id === current })));
}
