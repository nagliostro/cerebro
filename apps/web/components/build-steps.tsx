'use client';

import { useSyncExternalStore } from 'react';

import { CHAR_W, layout, type Rect } from '@/lib/step-layout';

/**
 * One point around the Dominus: a real step, never decoration. `from`: a craft neuron doing the
 * step (the Navegador), whose synapse leaves from that neuron's point instead.
 */
export type StepPoint = { key: string; text: string; busy: boolean; ai: boolean; from?: string };

/** The most steps on the sky at once, so a long work never fills it. */
const SHOWN = 14;
/** A longer label is cut (the whole text shows on hover and in the caption). */
const MAX_CHARS = 46;
/** How far the Memória slides left when the plan opens beside it (xl). */
const ASIDE_SHIFT = 200;

const subscribe = (change: () => void) => {
  window.addEventListener('resize', change);
  return () => window.removeEventListener('resize', change);
};
const snapshot = () =>
  `${window.innerWidth}x${window.innerHeight}x${window.matchMedia('(prefers-reduced-motion: reduce)').matches}`;

/** The window's size (and whether motion is reduced); null on the server. */
function useWindow() {
  const s = useSyncExternalStore(subscribe, snapshot, () => '');
  if (!s) return null;
  const [w, h, still] = s.split('x');
  return { w: Number(w), h: Number(h), still: still === 'true' };
}

/** A neuron's center in the Memória's own coordinates (where the Memória itself put it). */
function neuronCenter(el: HTMLElement): { x: number; y: number } | null {
  const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

const cut = (s: string) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s);

/**
 * The steps of the Dominus, each linked to whoever does it by a synapse with a pulse of light
 * that goes and comes while the step runs. They spread over the sky (lib/step-layout.ts): each
 * label where it covers no other, no neuron, the Dominus, the menu, the box or the plan.
 */
export function BuildSteps({ steps, aside = false }: { steps: StepPoint[]; aside?: boolean }) {
  const size = useWindow();
  if (!size) return null;

  // In the Memória's coordinates: it slides left beside an open plan on a wide screen.
  const shift = aside && size.w >= 1280 ? ASIDE_SHIFT : 0;
  const dominus = { x: size.w / 2, y: size.h / 2 + 12 };
  const labels = size.w >= 820;
  const neurons = new Map<string, { x: number; y: number }>();
  const obstacles: Rect[] = [{ x: dominus.x - 34, y: dominus.y - 34, w: 68, h: 68 }];
  for (const el of document.querySelectorAll<HTMLElement>('[data-neuron]')) {
    const c = neuronCenter(el);
    if (!c) continue;
    neurons.set(el.dataset.neuron!, c);
    obstacles.push({ x: c.x - 22, y: c.y - 22, w: 44, h: 44 });
  }
  // What lives outside the Memória (the menu, the box, the caption, the plan), in its coordinates.
  for (const el of document.querySelectorAll<HTMLElement>('[data-avoid]')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height)
      obstacles.push({ x: r.left + shift, y: r.top, w: r.width, h: r.height });
  }
  const area = {
    left: shift + 8,
    top: 16,
    bottom: size.h - 16,
    right: shift + size.w - (shift ? 416 : 0) - 8,
  };

  const shown = steps.slice(-SHOWN);
  const origins = shown.map((s) => (s.from && neurons.get(s.from)) || dominus);
  const placed = layout({
    // A busy label ends in moving dots: room for them too.
    labels: shown.map((s) => (labels ? `${cut(s.text)}${s.busy ? '...' : ''}` : '')),
    origins,
    obstacles,
    area,
  });
  const points = shown.flatMap((s, i) => {
    const p = placed[i];
    return p ? [{ ...s, ...p, ox: origins[i]!.x, oy: origins[i]!.y }] : [];
  });

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-40">
      <svg className="absolute inset-0 size-full">
        {points.map((p) => (
          <g key={p.key}>
            <line
              x1={p.ox}
              y1={p.oy}
              x2={p.x}
              y2={p.y}
              stroke="white"
              strokeOpacity={p.busy ? 0.18 : 0.08}
            />
            {p.busy && !size.still && (
              <circle r={2} fill="white">
                <animateMotion
                  dur={`${(Math.hypot(p.x - p.ox, p.y - p.oy) / 120).toFixed(2)}s`}
                  repeatCount="indefinite"
                  keyPoints="0;1;0"
                  keyTimes="0;0.5;1"
                  calcMode="linear"
                  path={`M${p.ox},${p.oy} L${p.x},${p.y}`}
                />
              </circle>
            )}
          </g>
        ))}
      </svg>
      {points.map((p) => (
        <div
          key={p.key}
          className={`absolute transition-opacity duration-500 ${p.busy ? '' : 'opacity-55'}`}
          style={{ left: p.x, top: p.y }}
        >
          <span
            className="absolute -top-[3px] -left-[3px] size-1.5 animate-[cb-pop_0.4s_cubic-bezier(0.2,0,0,1.4)] rounded-full"
            style={{
              background: p.ai ? 'var(--cb-cost)' : 'var(--cb-highlight)',
              boxShadow: `0 0 10px ${p.ai ? 'var(--cb-cost)' : 'var(--cb-highlight)'}`,
            }}
          />
          {/* Labels beside the points from 820px; on a phone, the caption says it. */}
          {labels && (
            <span
              title={p.text}
              className={`absolute -top-[9px] whitespace-nowrap ${p.left ? 'right-3' : 'left-3'} ${p.busy ? 'cb-busy text-(--cb-highlight)' : ''}`}
              style={{ maxWidth: Math.ceil(MAX_CHARS * CHAR_W) + 30 }}
            >
              {cut(p.text)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
