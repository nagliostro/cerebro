'use client';

import { useEffect, useState } from 'react';

import { DOMINUS_COLOR, NeuronDot } from './neuron-dot';

/**
 * The Dominus at the center of the empty screen. Touching it shows what is true right now:
 * the version, where the data lives and that no AI is connected yet. Esc or a second touch
 * hides it again.
 */
/** A line of the status; `cost` lines are in gold, the color reserved for what is spent. */
export type StatusLine = { text: string; cost?: boolean };

export function Dominus({ label, lines }: { label: string; lines: StatusLine[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative flex flex-col items-center">
      <NeuronDot
        color={DOMINUS_COLOR}
        label={label}
        expanded={open}
        controls="dominus-status"
        onClick={() => setOpen((v) => !v)}
      />
      <div
        id="dominus-status"
        role="status"
        hidden={!open}
        className="absolute top-full mt-3 w-[min(90vw,32rem)] text-center break-words"
      >
        {lines.map((line) => (
          <p key={line.text} className={line.cost ? 'text-(--cb-cost)' : undefined}>
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}
