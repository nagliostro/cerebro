import { coreRequest } from '@cerebro/dominus/client';
import type { Capabilities, HealthCheck } from '@cerebro/dominus/types';

import type { Messages } from '@/lib/i18n';

type ProviderInfo = { id: string; name: string; capabilities: Capabilities; health: HealthCheck };

/**
 * What the Dominus says about the AIs, in the owner's language: the ones ready to use, or, when
 * none is, what is missing in each. Asked of the core, which keeps the answer for a while.
 */
export async function aiStatus(m: Messages): Promise<string[]> {
  let list: ProviderInfo[];
  try {
    list = await coreRequest<ProviderInfo[]>('GET', '/providers');
  } catch {
    return [m.coreDown];
  }
  const ready = list.flatMap((p) => (p.health.ok ? [m.aiReady(p.name, p.health.version)] : []));
  if (ready.length) return ready;
  return [
    m.noAi,
    ...list.flatMap((p) => (p.health.ok ? [] : [m.aiProblem[p.health.problem](p.name)])),
  ];
}
