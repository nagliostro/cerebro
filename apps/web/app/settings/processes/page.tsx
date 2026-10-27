import { headers } from 'next/headers';
import Link from 'next/link';

import { pickLocale, t, type Messages } from '@/lib/i18n';
import { coreRequest } from '@/lib/server/core';

type Entry = {
  id: string;
  request: string;
  status: string;
  target: string | null;
  neuron: string | null;
  adjusting: boolean;
  exchanges: { kind: string; text: string }[];
  error: string | null;
  createdAt: number;
  thinkCostUsd: number;
  buildCostUsd: number | null;
  research: {
    feature: string;
    sites: number;
    pages: number;
    cases: number;
    rules: number;
    libraries: string[];
    gaps: number;
  } | null;
  plan: {
    name: string;
    understood: string;
    creates: string[];
    libraries: string[];
  } | null;
  build: { files: number; verified: { passed: number; total: number } | null } | null;
};
type Neuron = { id: string; name: string; color: string };

/** One stage of a request: a point on its timeline, filled once the stage was done. */
function Stage({
  name,
  done,
  children,
}: {
  name: string;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="group relative pb-5 pl-6 last:pb-0">
      <span
        aria-hidden
        className="absolute top-[7px] bottom-0 left-[3px] w-px bg-white/10 group-last:hidden"
      />
      <span
        aria-hidden
        className={`absolute top-[5px] left-0 size-[7px] rounded-full ${done ? 'bg-white' : 'ring-1 ring-white/40'}`}
      />
      <p className="text-(--cb-highlight)">{name}</p>
      {children && <div className="mt-1 grid gap-1">{children}</div>}
    </li>
  );
}

function outcome(e: Entry, m: Messages['settings']['processes']) {
  if (e.status === 'built') return e.adjusting ? m.outcome.adjusted : m.outcome.built;
  if (['researching', 'thinking', 'building'].includes(e.status)) return m.outcome.running;
  if (['questions', 'ready'].includes(e.status)) return m.outcome.open;
  return m.outcome[e.status as keyof typeof m.outcome] ?? e.status;
}

// Settings → Processes: each request the owner made, newest first, through the Cerebro's stages
// (request, research, plan, build, outcome), the way the Cerebro before showed them. Read from the
// plans the core keeps; nothing here calls an AI.
export default async function Processes() {
  const locale = pickLocale((await headers()).get('accept-language'));
  const all = t(locale);
  const m = all.settings.processes;
  const [list, graph] = await Promise.all([
    coreRequest<Entry[]>('GET', '/plans/history').catch(() => []),
    coreRequest<{ neurons: Neuron[] }>('GET', '/graph').catch(() => ({ neurons: [] })),
  ]);
  const neurons = new Map(graph.neurons.map((n) => [n.id, n]));
  const when = (ms: number) =>
    new Date(ms).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <>
      {list.length === 0 && <p>{m.none}</p>}
      <ul className="divide-y divide-white/6">
        {list.map((e, i) => {
          const n = neurons.get(e.neuron ?? e.target ?? '');
          const cost = e.thinkCostUsd + (e.buildCostUsd ?? 0);
          const ended = !['researching', 'thinking', 'building', 'questions', 'ready'].includes(
            e.status,
          );
          return (
            <li key={e.id} className="py-3 first:pt-0">
              <details open={i === 0} className="group/process">
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 py-1 [&::-webkit-details-marker]:hidden">
                  {n && (
                    <span
                      aria-hidden
                      className="size-2 shrink-0 self-center rounded-full"
                      style={{ background: n.color }}
                    />
                  )}
                  <span className="text-(--cb-highlight)">
                    {e.plan?.name || n?.name || e.request.slice(0, 60)}
                  </span>
                  <span>{outcome(e, m)}</span>
                  <span className="ml-auto tabular-nums">{when(e.createdAt)}</span>
                </summary>
                <ol className="mt-3">
                  <Stage name={m.stages.request} done>
                    <p>“{e.request}”</p>
                    {e.exchanges.map((x, j) => (
                      <p key={j}>{m.said(x.text)}</p>
                    ))}
                  </Stage>
                  {e.research && (
                    <Stage name={m.stages.research} done={!!e.plan || ended}>
                      {e.research.feature && <p>{e.research.feature}</p>}
                      <p>
                        {m.researched(
                          e.research.sites,
                          e.research.pages,
                          e.research.cases,
                          e.research.rules,
                        )}
                        {e.research.gaps > 0 && ` · ${m.gaps(e.research.gaps)}`}
                      </p>
                      {e.research.libraries.length > 0 && (
                        <p>{m.libraries(e.research.libraries.join(', '))}</p>
                      )}
                    </Stage>
                  )}
                  <Stage name={m.stages.plan} done={!!e.plan}>
                    {e.plan && (
                      <>
                        <p>{e.plan.understood}</p>
                        <p>
                          {m.parts(e.plan.creates.length)}
                          {e.plan.libraries.length > 0 &&
                            ` · ${m.libraries(e.plan.libraries.join(', '))}`}
                        </p>
                      </>
                    )}
                  </Stage>
                  <Stage name={m.stages.build} done={e.status === 'built' || e.status === 'undone'}>
                    {e.build && (
                      <p>
                        {m.files(e.build.files)}
                        {e.build.verified &&
                          ` · ${m.verified(e.build.verified.passed, e.build.verified.total)}`}
                      </p>
                    )}
                  </Stage>
                  <Stage name={m.stages.out} done={ended}>
                    <p>
                      {outcome(e, m)}
                      {e.status === 'failed' && e.error && ` · ${e.error}`}
                    </p>
                    {cost > 0 && <p className="text-(--cb-cost)">{m.cost(all.build.usd(cost))}</p>}
                    {n && e.status === 'built' && (
                      <Link
                        href={`/neuron/${n.id}`}
                        className="w-fit underline decoration-white/25 underline-offset-[3px] hover:text-(--cb-highlight)"
                      >
                        {m.open(n.name)}
                      </Link>
                    )}
                  </Stage>
                </ol>
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}
