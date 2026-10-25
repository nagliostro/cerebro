import { coreRequest } from '@cerebro/dominus/client';
import type { WindowStatus } from '@cerebro/dominus/quota';
import type { Capabilities, HealthCheck } from '@cerebro/dominus/types';

import type { StatusLine } from '@/components/dominus';
import type { Messages } from '@/lib/i18n';

type ProviderInfo = { id: string; name: string; capabilities: Capabilities; health: HealthCheck };
type ProviderQuota = { provider: string; name: string; windows: WindowStatus[] };

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "Claude Code: sessão 8% · semana 85%, ritmo 79%": each window, and its pace when known. */
function quotaLine(q: ProviderQuota, m: Messages): StatusLine | null {
  if (!q.windows.length) return null;
  const parts = q.windows.map((w) => {
    const base = `${m.window[w.name]} ${pct(w.used)}`;
    return w.pace ? `${base}, ${m.pace(pct(w.pace.expected))}` : base;
  });
  const stale = q.windows.some((w) => w.stale) ? ` (${m.stale})` : '';
  return { text: `${q.name}: ${parts.join(' · ')}${stale}`, cost: true };
}

/**
 * What the Dominus says about the AIs, in the owner's language: the ones ready to use with their
 * quota, or, when none is, what is missing in each. Asked of the core, which answers from its
 * database and a cached health check, without calling any AI.
 */
export async function aiStatus(m: Messages): Promise<StatusLine[]> {
  let list: ProviderInfo[];
  let quota: ProviderQuota[];
  try {
    [list, quota] = await Promise.all([
      coreRequest<ProviderInfo[]>('GET', '/providers'),
      coreRequest<ProviderQuota[]>('GET', '/quota'),
    ]);
  } catch {
    return [{ text: m.coreDown }];
  }
  const ready = list.filter((p) => p.health.ok);
  if (ready.length)
    return ready.flatMap((p) => {
      const line: StatusLine = {
        text: m.aiReady(p.name, (p.health as { version: string }).version),
      };
      const q = quota.find((x) => x.provider === p.id);
      const cost = q && quotaLine(q, m);
      return cost ? [line, cost] : [line];
    });
  return [
    { text: m.noAi },
    ...list.flatMap((p) => (p.health.ok ? [] : [{ text: m.aiProblem[p.health.problem](p.name) }])),
  ];
}
