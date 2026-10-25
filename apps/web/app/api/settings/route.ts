import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized } from '@/lib/server/require-session';

// Settings → General: the owner's options (today, how deep a research goes).

export async function GET() {
  if (!(await hasSession())) return unauthorized();
  return fromCore(() => coreRequest('GET', '/settings'));
}

export async function POST(request: Request) {
  if (!(await hasSession())) return unauthorized();
  const b = (await request.json().catch(() => null)) as { depth?: unknown } | null;
  return fromCore(() => coreRequest('POST', '/settings', { depth: b?.depth }));
}
