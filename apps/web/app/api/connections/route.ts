import { coreRequest } from '@/lib/server/core';

import { fromCore, hasSession, unauthorized } from '@/lib/server/require-session';

// Settings → Connections: the API connections. A key goes from here to the core and the vault;
// no answer ever carries one back.

export async function GET() {
  if (!(await hasSession())) return unauthorized();
  return fromCore(() => coreRequest('GET', '/connections'));
}

export async function POST(request: Request) {
  if (!(await hasSession())) return unauthorized();
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const body = {
    id: b?.id,
    preset: b?.preset,
    name: b?.name,
    baseUrl: b?.baseUrl,
    models: b?.models,
    key: b?.key,
    monthlyCapUsd: b?.monthlyCapUsd,
  };
  return fromCore(() => coreRequest('POST', '/connections', body));
}
