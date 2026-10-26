'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { t, type Locale } from '@/lib/i18n';

type Entry = {
  id: string;
  request: string;
  status: string;
  adjusting: boolean;
  createdAt: number;
  thinkCostUsd: number;
  buildCostUsd: number | null;
  error: string | null;
};

/**
 * A neuron's adjustments, as in the Cerebro before: opened by the pencil, in the plan's place (the
 * right side on a wide screen, a sheet from below on a phone). What was already asked (the
 * request in white, how it ended below, Undo on the last adjustment), the work going on now, and
 * the box to ask for the next change.
 */
export function AdjustPanel({
  neuron,
  name,
  locale,
  live,
  box,
  refresh,
  onUndo,
  onClose,
}: {
  neuron: string;
  name: string;
  locale: Locale;
  /** What is going on now (the steps, the countdown, how it ended). */
  live: React.ReactNode;
  /** The Dominus box, docked here. */
  box: React.ReactNode;
  /** Changes when a plan moves on, so the list is read again. */
  refresh: string;
  onUndo: (plan: string) => void;
  onClose: () => void;
}) {
  const all = t(locale);
  const m = all.adjust;
  const out = all.settings.processes.outcome;
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    let gone = false;
    void fetch(`/api/plans/history?neuron=${neuron}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Entry[]) => !gone && setEntries(list));
    return () => {
      gone = true;
    };
  }, [neuron, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !live && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, onClose]);

  const outcome = (e: Entry) =>
    e.status === 'built'
      ? e.adjusting
        ? out.adjusted
        : out.built
      : ['researching', 'thinking', 'building'].includes(e.status)
        ? out.running
        : ['questions', 'ready'].includes(e.status)
          ? out.open
          : (out[e.status as keyof typeof out] ?? e.status);
  // Only the newest adjustment can be undone, and only once.
  const undoable = entries.find((e) => e.status === 'built' || e.status === 'undone');
  const when = (ms: number) =>
    new Date(ms).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <section
      data-avoid
      aria-label={m.title(name)}
      className="fixed inset-x-2 bottom-2 z-50 flex max-h-[78dvh] animate-[cb-pop_0.3s_cubic-bezier(0.2,0,0,1)] flex-col rounded-[10px] bg-[oklch(0.13_0.006_265/0.72)] shadow-[inset_0_0_0_1px_var(--cb-outline)] backdrop-blur-md min-[820px]:left-1/2 min-[820px]:w-[40rem] min-[820px]:-translate-x-1/2 xl:top-[84px] xl:right-6 xl:bottom-6 xl:left-auto xl:max-h-none xl:w-96 xl:translate-x-0"
    >
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <h2 className="text-(--cb-highlight)">{m.title(name)}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={m.close}
          className="grid size-11 cursor-pointer place-items-center rounded-full hover:text-(--cb-highlight)"
        >
          <X aria-hidden className="size-[18px]" strokeWidth={1.75} />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 [scrollbar-width:thin] grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-x-hidden overflow-y-auto px-5 pt-2 pb-3 [overflow-wrap:anywhere]">
        {entries.length === 0 && <p>{m.none}</p>}
        <ol className="grid gap-4">
          {[...entries].reverse().map((e) => {
            const cost = e.thinkCostUsd + (e.buildCostUsd ?? 0);
            return (
              <li key={e.id} className="grid gap-1">
                <p className="text-(--cb-highlight)">{e.request}</p>
                <p>
                  {outcome(e)} · {when(e.createdAt)}
                  {cost > 0 && <span className="text-(--cb-cost)"> · {all.build.usd(cost)}</span>}
                </p>
                {undoable?.id === e.id && e.status === 'built' && e.adjusting && (
                  <button
                    type="button"
                    onClick={() => onUndo(e.id)}
                    className="mt-1 inline-flex h-11 w-fit cursor-pointer items-center rounded-full bg-white/8 px-5 hover:text-white"
                  >
                    {all.build.undo}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {live && (
          <div role="status" aria-live="polite" className="grid justify-items-start gap-1.5">
            {live}
          </div>
        )}
      </div>
      <div className="px-3 pt-1 pb-3">{box}</div>
    </section>
  );
}
