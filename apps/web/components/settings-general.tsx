'use client';

import { useRef, useState } from 'react';

import { t, type Locale } from '@/lib/i18n';

import { post } from './settings-ui';

type Depth = 'shallow' | 'medium' | 'deep';
const DEPTHS: Depth[] = ['shallow', 'medium', 'deep'];

/** How deep a research goes: one choice, saved at once. */
export function DepthChoice({ initial, locale }: { initial: Depth; locale: Locale }) {
  const m = t(locale).settings;
  const [depth, setDepth] = useState(initial);
  const [note, setNote] = useState('');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  async function choose(d: Depth) {
    const before = depth;
    setDepth(d);
    try {
      await post('/api/settings', { depth: d });
      setNote(m.general.saved);
    } catch (e) {
      setDepth(before);
      setNote(m.failed((e as Error).message));
    }
  }

  return (
    <>
      <div role="radiogroup" aria-label={m.general.depth} className="flex flex-wrap gap-2">
        {DEPTHS.map((d, i) => (
          <button
            key={d}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={depth === d}
            tabIndex={depth === d ? 0 : -1}
            onClick={() => void choose(d)}
            onKeyDown={(e) => {
              const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
              if (!step) return;
              e.preventDefault();
              const n = (i + step + DEPTHS.length) % DEPTHS.length;
              void choose(DEPTHS[n]!);
              refs.current[n]?.focus();
            }}
            className={`min-h-11 cursor-pointer rounded-full px-4 ${
              depth === d
                ? 'bg-white text-[oklch(0.15_0.006_265)]'
                : 'shadow-[inset_0_0_0_1px_var(--cb-outline)] hover:text-(--cb-highlight)'
            }`}
          >
            {m.general.depths[d]}
          </button>
        ))}
      </div>
      <p role="status" className="mt-2 min-h-[1lh]">
        {note}
      </p>
    </>
  );
}
