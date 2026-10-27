'use client';

import { Globe } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { t, type Locale } from '@/lib/i18n';
import { BTN_PRIMARY, BTN_SOFT } from './button';

export type Site = {
  host: string;
  why: string;
  status: 'allowed' | 'requested';
  hits: number;
  lastAt: number | null;
};
/** A site the Navegador opened in its researches (read-only: it is its work, not a permission). */
export type Visited = { host: string; researches: number };

/**
 * The globe of a neuron's screen, as in the Cerebro before: only when its application reaches the
 * internet (or, for the Navegador, the sites of its researches). Each site with what it is for and
 * how often it was reached; one asking for access shows a dot on the globe, and the owner allows
 * it or takes it away.
 */
export function NetworkPanel({
  neuron,
  name,
  initial,
  visited,
  locale,
}: {
  neuron: string;
  name: string;
  initial: Site[];
  visited: Visited[];
  locale: Locale;
}) {
  const all = t(locale);
  const m = all.network;
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState(initial);
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const asking = sites.some((s) => s.status === 'requested');

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

  // The application may ask for a site while open: read again when the globe opens.
  useEffect(() => {
    if (!open) return;
    void fetch(`/api/neurons/${neuron}/network`)
      .then((r) => (r.ok ? r.json() : null))
      .then((list: Site[] | null) => list && setSites(list));
  }, [open, neuron]);

  async function decide(host: string, allow: boolean) {
    setError(false);
    const res = await fetch(`/api/neurons/${neuron}/network`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ host, allow }),
    }).catch(() => null);
    if (!res?.ok) return setError(true);
    setSites(await res.json());
  }

  if (!sites.length && !visited.length) return null;
  const when = (ms: number) =>
    new Date(ms).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="network"
        aria-label={asking ? m.buttonAsking(name) : m.button(name)}
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-11 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/8 hover:text-white aria-expanded:bg-white/12 aria-expanded:text-white"
      >
        <Globe aria-hidden className="size-[18px]" strokeWidth={1.75} />
        {asking && (
          <span aria-hidden className="absolute top-2 right-2 size-1.5 rounded-full bg-white" />
        )}
      </button>

      <section
        id="network"
        aria-label={m.title(name)}
        hidden={!open}
        className="absolute top-13 right-0 z-10 w-[min(20rem,calc(100vw-32px))] rounded-[10px] bg-[oklch(0.13_0.006_265/0.92)] p-4 [overflow-wrap:anywhere] shadow-[inset_0_0_0_1px_oklch(1_0_0/12%)] backdrop-blur-[14px]"
      >
        <h2 className="text-(--cb-highlight)">{m.title(name)}</h2>
        <p className="mt-0.5">{visited.length && !sites.length ? m.visitedNote : m.note}</p>
        <ul className="mt-4 grid max-h-[60dvh] gap-4 overflow-y-auto">
          {sites.map((s) => (
            <li key={s.host} className="grid gap-1">
              <span className="text-(--cb-highlight)">{s.host}</span>
              {s.why && <span>{s.why}</span>}
              <span>
                {s.status === 'requested'
                  ? m.asking
                  : s.hits
                    ? m.hits(s.hits, s.lastAt ? when(s.lastAt) : '')
                    : m.never}
              </span>
              {s.status === 'requested' ? (
                <button
                  type="button"
                  onClick={() => void decide(s.host, true)}
                  className={`mt-1 w-fit ${BTN_PRIMARY}`}
                  aria-label={`${m.allow}: ${s.host}`}
                >
                  {m.allow}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void decide(s.host, false)}
                  className={`mt-1 w-fit ${BTN_SOFT}`}
                  aria-label={`${m.remove}: ${s.host}`}
                >
                  {m.remove}
                </button>
              )}
            </li>
          ))}
          {visited.map((v) => (
            <li key={v.host} className="grid gap-1">
              <span className="text-(--cb-highlight)">{v.host}</span>
              <span>{m.researches(v.researches)}</span>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-3">
            {all.settings.failed('')}
          </p>
        )}
      </section>
    </div>
  );
}
