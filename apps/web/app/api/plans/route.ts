import { coreRequest } from '@/lib/server/core';

import { pickLocale } from '@/lib/i18n';
import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// A request to the Dominus: it becomes a plan (for a new neuron, or to adjust one), written in the
// owner's language. The core does the rest; this only checks the session and passes it on.

export async function POST(request: Request) {
  if (!(await hasSession())) return unauthorized();
  const b = (await request.json().catch(() => null)) as { request?: unknown; target?: unknown };
  const target = typeof b?.target === 'string' && validNeuronId(b.target) ? b.target : undefined;
  return fromCore(() =>
    coreRequest('POST', '/plans', {
      request: b?.request,
      target,
      locale: pickLocale(request.headers.get('accept-language')),
    }),
  );
}
