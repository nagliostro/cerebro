'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { t, type Locale } from '@/lib/i18n';
import { notify, notifyFailure } from '@/lib/toast';

import { PLAIN, post } from './settings-ui';

export type Run = {
  id: string;
  type: string;
  kind: string | null;
  provider: string | null;
  status: 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'canceled';
  error: string | null;
  costUsd: number | null;
  tokens: number | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

const LIVE = new Set(['queued', 'running', 'waiting']);

/** The runs, newest first; one still going can be stopped, and the list follows it live. */
export function RunsPanel({ runs, locale }: { runs: Run[]; locale: Locale }) {
  const all = t(locale);
  const m = all.settings.runs;
  const router = useRouter();
  const going = runs.some((r) => LIVE.has(r.status));

  // While something runs, read the list again every few seconds (the core keeps the truth).
  useEffect(() => {
    if (!going) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [going, router]);

  async function stop(id: string) {
    try {
      await post(`/api/runs/${id}/cancel`);
      notify.success(all.toast.runStopped);
      router.refresh();
    } catch (e) {
      notifyFailure(all.toast.runStopFailed, e, all.toast);
    }
  }

  const kindName = (k: string | null) =>
    m.kinds[(k ?? 'other') as keyof typeof m.kinds] ?? m.kinds.other;
  const time = (ms: number) =>
    new Date(ms).toLocaleString(locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const took = (r: Run) => {
    if (!r.startedAt || !r.finishedAt) return '';
    const s = Math.max(1, Math.round((r.finishedAt - r.startedAt) / 1000));
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  };

  return (
    <>
      {runs.length === 0 ? (
        <p>{m.none}</p>
      ) : (
        <ul className="divide-y divide-white/6">
          {runs.map((r) => (
            <li key={r.id} className="grid gap-1 py-3 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6">
                <span className="text-(--cb-highlight)">
                  {kindName(r.kind)}
                  {r.provider && <span className="text-(--cb-text)"> · {r.provider}</span>}
                </span>
                <span className="tabular-nums">{time(r.createdAt)}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-6">
                <span>
                  {m.status[r.status]}
                  {took(r) && ` · ${took(r)}`}
                  {r.tokens && ` · ${r.tokens.toLocaleString(locale)} tokens`}
                </span>
                {r.costUsd !== null && (
                  <span className="text-(--cb-cost) tabular-nums">{all.build.usd(r.costUsd)}</span>
                )}
                {LIVE.has(r.status) && (
                  <button type="button" onClick={() => void stop(r.id)} className={PLAIN}>
                    {m.stop}
                  </button>
                )}
              </div>
              {r.status === 'failed' && r.error && <p className="break-words">{r.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
