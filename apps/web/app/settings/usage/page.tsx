import { headers } from 'next/headers';

import { Block } from '@/components/settings-ui';
import { pickLocale, t } from '@/lib/i18n';
import { coreRequest } from '@/lib/server/core';

type Window = {
  name: 'session' | 'day' | 'week' | 'month' | 'balance';
  used: number;
  resetsAt: string | null;
  source: 'official' | 'estimated';
  blocked: boolean;
};
type Usage = {
  provider: string;
  name: string;
  windows: Window[];
  spentLast7Days: { calls: number; usd: number; tokens: number };
};

// Settings → Usage: each AI's limits as the Dominus measures them, and what each cost. Read from
// the core's records; nothing here calls an AI.
export default async function UsagePage() {
  const locale = pickLocale((await headers()).get('accept-language'));
  const all = t(locale);
  const m = all.settings.usage;
  const list = (await coreRequest<Usage[]>('GET', '/quota').catch(() => [])).filter(
    (u) => u.provider !== 'simulated',
  );
  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <>
      {list.map((u) => (
        <Block key={u.provider} title={u.name}>
          {u.windows.length === 0 && <p>{m.none}</p>}
          <ul className="grid gap-4">
            {u.windows.map((w) => (
              <li key={w.name} className="grid gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6">
                  <span className="text-(--cb-highlight)">
                    {m.windows[w.name]}
                    {w.source === 'estimated' && ` · ${m.estimated}`}
                  </span>
                  <span className="tabular-nums">
                    {w.blocked ? m.blocked : m.used(all.build.percent(w.used))}
                    {w.resetsAt && ` · ${m.resets(when(w.resetsAt))}`}
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label={m.windows[w.name]}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(w.used * 100)}
                  className="h-1 overflow-hidden rounded-full bg-white/8"
                >
                  <div
                    className={`h-full rounded-full ${w.used >= 0.9 ? 'bg-(--cb-cost)' : 'bg-white/70'}`}
                    style={{ width: `${Math.min(100, Math.round(w.used * 100))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-(--cb-cost)">
            {m.spent(all.build.usd(u.spentLast7Days.usd), u.spentLast7Days.calls)}
          </p>
        </Block>
      ))}
    </>
  );
}
