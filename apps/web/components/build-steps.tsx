'use client';

import { useSyncExternalStore } from 'react';

/**
 * One point around the Dominus: a real step, never decoration. `from`: a craft neuron doing the
 * step (the Navegador), whose synapse leaves from that neuron's point instead.
 */
export type StepPoint = { key: string; text: string; busy: boolean; ai: boolean; from?: string };

/** Where a neuron is on the screen now (its point in the Memória), if it is there. */
function centerOf(id: string): { x: number; y: number } | null {
  const el = document.querySelector(`[data-neuron="${CSS.escape(id)}"]`);
  const r = el?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

/** A craft neuron's steps go outward, away from the Dominus. */
const CRAFT_SLOTS: [number, number][] = [
  [0.25, 95],
  [1.3, 80],
  [0.8, 115],
  [-0.4, 105],
];

// Angles (radians) and distances vary: nothing symmetric, like a real network.
const SLOTS: [number, number][] = [
  [-2.5, 120],
  [-0.55, 150],
  [2.3, 135],
  [0.6, 175],
  [-1.4, 190],
  [1.55, 160],
  [3.0, 200],
  [-3.0, 165],
  [-2.0, 215],
  [0.15, 210],
];

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

/**
 * The steps of the Dominus around it, each linked to it by a synapse with a pulse of light that
 * goes and comes while the step runs. Busy steps say what they do; done ones their result and
 * step back. The Dominus sits at the center of the screen, 12px down (as in the Memória).
 */
export function BuildSteps({ steps }: { steps: StepPoint[] }) {
  const size = useWindow();
  if (!size) return null;

  const cx = size.w / 2;
  const cy = size.h / 2 + 12;
  // The last few, so a long build never covers the sky.
  const shown = steps.slice(-SLOTS.length);
  let own = 0;
  let craft = 0;
  const points = shown.map((s) => {
    const origin = s.from ? centerOf(s.from) : null;
    // Away from the Dominus: the side of the screen the craft neuron is on.
    const side = origin ? Math.atan2(origin.y - cy, origin.x - cx) : 0;
    const [a, d] = origin
      ? CRAFT_SLOTS[craft++ % CRAFT_SLOTS.length]!
      : SLOTS[own++ % SLOTS.length]!;
    const angle = origin ? side + a : a;
    const ox = origin?.x ?? cx;
    const oy = origin?.y ?? cy;
    const r = Math.min(d, size.w * 0.3);
    return {
      ...s,
      ox,
      oy,
      x: ox + Math.cos(angle) * r,
      y: oy + Math.sin(angle) * r * 0.8,
      left: Math.cos(angle) < 0,
    };
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
          <span
            className={`absolute -top-[9px] hidden whitespace-nowrap min-[820px]:block ${p.left ? 'right-3' : 'left-3'} ${p.busy ? 'cb-busy text-(--cb-highlight)' : ''}`}
          >
            {p.text}
          </span>
        </div>
      ))}
    </div>
  );
}
