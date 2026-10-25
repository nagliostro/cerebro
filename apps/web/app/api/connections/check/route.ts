import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized } from '@/lib/server/require-session';

// Settings → Connections → Test: every AI checked now, not from the cache.

export async function POST() {
  if (!(await hasSession())) return unauthorized();
  return fromCore(() => coreRequest('GET', '/providers?fresh'));
}
