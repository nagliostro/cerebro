'use client';

import { History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { t, type Locale } from '@/lib/i18n';

export type Use = {
  at: number;
  kind: 'built' | 'adjusted' | 'research';
  request: string;
  detail: string;
  ok: boolean;
};
export type Uses = { total: number; items: Use[] };

/**
 * The clock of a neuron's screen, the same on every neuron: each time the Dominus used it (made
 * it, adjusted it, researched for it), with the request that led to it. Read only, no AI.
 */
export function UsesPanel({
  neuron,
  name,
  initial,
  locale,
}: {
  neuron: string;
  name: string;
  initial: Uses;
  locale: Locale;
}) {
  const m = t(locale).uses;
  const [open, setOpen] = useState(false);
  const [uses, setUses] = useState(initial);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  // The Dominus may have used it meanwhile: read again when it opens.
  useEffect(() => {
    if (!open) return;
    void fetch(`/api/neurons/${neuron}/uses`)
      .then((r) => (r.ok ? r.json() : null))
      .then((list: Uses | null) => list && setUses(list));
  }, [open, neuron]);

  const when = (ms: number) =>
    new Date(ms).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="uses"
        aria-label={m.button(name, uses.total)}
        title={m.title}
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/8 hover:text-white aria-expanded:bg-white/12 aria-expanded:text-white"
      >
        <History aria-hidden className="size-[18px]" strokeWidth={1.75} />
      </button>

      <section
        id="uses"
        aria-label={m.title}
        hidden={!open}
        className="absolute top-13 right-0 z-10 w-[min(24rem,calc(100vw-32px))] rounded-[10px] bg-[oklch(0.13_0.006_265/0.92)] p-4 [overflow-wrap:anywhere] shadow-[inset_0_0_0_1px_oklch(1_0_0/12%)] backdrop-blur-[14px]"
      >
        <h2 className="text-(--cb-highlight)">{m.title}</h2>
        <p className="mt-0.5">{uses.total ? m.note(uses.items.length, uses.total) : m.none}</p>
        {uses.items.length > 0 && (
          <ul className="mt-4 grid max-h-[60dvh] gap-4 overflow-y-auto">
            {uses.items.map((u) => (
              <li key={`${u.at}-${u.kind}`} className="grid gap-0.5">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 text-(--cb-highlight)">{m.kinds[u.kind]}</span>
                  <span className="shrink-0">{when(u.at)}</span>
                </span>
                {u.detail && <span>{u.detail}</span>}
                <span>{m.request(u.request)}</span>
                {!u.ok && <span>{m.failed}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
