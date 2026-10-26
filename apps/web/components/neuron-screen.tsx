'use client';

import { Pencil } from 'lucide-react';
import { useState } from 'react';

import { t, type Locale } from '@/lib/i18n';

import { Construction, type PlanView } from './construction';

/**
 * A neuron's screen, as in the Cerebro before: at the top its dot and name and, on the right,
 * its tools (the globe, when it reaches the internet; the key) and the pencil that opens its
 * adjustments; below, its application. With the adjustments open on a wide screen, the
 * application steps aside to the left.
 */
export function NeuronScreen({
  locale,
  neuron,
  tools,
  others,
  initial,
  children,
}: {
  locale: Locale;
  neuron: { id: string; name: string; color: string };
  /** The globe and the key, drawn by the page. */
  tools: React.ReactNode;
  others: { id: string; name: string; color: string }[];
  initial: PlanView | null;
  /** The application (or the line that says it has none yet). */
  children: React.ReactNode;
}) {
  const m = t(locale).adjust;
  // Open already when there is a plan of it going on: its work shows there.
  const [open, setOpen] = useState(!!initial);
  return (
    <>
      <div
        className={`flex flex-1 flex-col transition-[margin] duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${open ? 'xl:mr-[408px]' : ''}`}
      >
        <header className="mx-auto mt-5 flex w-[min(100%-32px,760px)] items-center gap-1">
          <h1 className="mr-auto flex items-center gap-2.5 text-(--cb-highlight)">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: neuron.color, boxShadow: `0 0 12px ${neuron.color}` }}
            />
            {neuron.name}
          </h1>
          {tools}
          <button
            type="button"
            aria-expanded={open}
            aria-label={m.open(neuron.name)}
            onClick={() => setOpen((v) => !v)}
            className="grid size-11 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/8 hover:text-white aria-expanded:bg-white/12 aria-expanded:text-white"
          >
            <Pencil aria-hidden className="size-[18px]" strokeWidth={1.75} />
          </button>
        </header>
        {children}
      </div>
      <Construction
        key={neuron.id}
        locale={locale}
        others={others}
        target={{ id: neuron.id, name: neuron.name }}
        initial={initial}
        panel={{ open, setOpen }}
      />
    </>
  );
}
