'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  firstPlaces,
  FIRST_TURN,
  nudge,
  project,
  turnBy,
  viewFor,
  type Turn,
  type Vec3,
} from '@/lib/memory-3d';

import type { StatusLine } from './dominus';
import { DOMINUS_COLOR, NeuronDot } from './neuron-dot';

export type MemoryNeuron = {
  id: string;
  name: string;
  color: string;
  role: 'life' | 'craft';
  /** 0..1 of the heaviest neuron: a bigger halo and a brighter core. */
  strength: number;
  /** Shown after the name on hover, e.g. "peso 3,1". */
  detail: string | null;
};

type Props = {
  dominusLabel: string;
  dominusLines: StatusLine[];
  neurons: MemoryNeuron[];
  /** Synapse weights by pair ("a|b", sorted ids); the rest of the complete graph has none yet. */
  synapses: Record<string, number>;
  /** Pairs with an active link (one neuron reads the other), in the same "a|b" form. */
  links: string[];
};

const SAVED = 'cerebro.memory';
const DOMINUS = 'dominus';
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Places and turn the owner left in this browser; may be unavailable, then nothing is kept. */
function load(): { places: Record<string, Vec3>; turn: Turn } | null {
  try {
    return JSON.parse(localStorage.getItem(SAVED) ?? 'null');
  } catch {
    return null;
  }
}

/**
 * The Memória: the Dominus at the center and the neurons in 3D around it, all linked (a complete
 * graph) by dashed synapses that brighten with conversations. Dragging the sky turns it; dragging
 * a neuron moves only that one; the wheel (or PageUp/PageDown) brings it closer or farther; a
 * double click on the sky goes back to the first view. Touching a neuron opens its application;
 * touching the Dominus shows what is true right now, and while it speaks the rest steps back.
 */
export function Memory({ dominusLabel, dominusLines, neurons, synapses, links }: Props) {
  const [open, setOpen] = useState(false);
  const sky = useRef<HTMLElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dots = useRef(new Map<string, HTMLAnchorElement>());
  const places = useRef(new Map<string, Vec3>());
  const turn = useRef<Turn>(FIRST_TURN);
  const moved = useRef(false);

  const activeLinks = useMemo(() => new Set(links), [links]);

  const draw = useCallback(() => {
    const view = viewFor(window.innerWidth, window.innerHeight);
    const at = new Map<string, { x: number; y: number }>([[DOMINUS, { x: view.cx, y: view.cy }]]);
    for (const n of neurons) {
      const el = dots.current.get(n.id);
      const place = places.current.get(n.id);
      if (!el || !place) continue;
      const p = project(place, turn.current, view);
      at.set(n.id, p);
      // Far: smaller, dimmer (down to 40%) and behind the Dominus (z 50); near: above it.
      const far = Math.min(1, Math.max(0, -p.depth / view.radius));
      el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.scale})`;
      el.style.opacity = String(1 - 0.6 * far);
      el.style.zIndex = String(Math.round(50 + p.depth));
      el.style.visibility = 'visible';
    }
    // Dashed at 8%, up to +21% with conversations; an active link is the brightest (50%).
    const ids = [...at.keys()];
    let lines = '';
    ids.forEach((a, i) =>
      ids.slice(i + 1).forEach((b) => {
        const k = key(a, b);
        const active = activeLinks.has(k);
        const o = active ? 0.5 : 0.08 + 0.21 * Math.min(1, synapses[k] ?? 0);
        const p = at.get(a)!;
        const q = at.get(b)!;
        lines += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="white" stroke-opacity="${o.toFixed(2)}" stroke-width="${active ? 1.25 : 1}" stroke-dasharray="2 5"/>`;
      }),
    );
    if (svg.current) svg.current.innerHTML = lines;
  }, [neurons, synapses, activeLinks]);

  const save = useCallback(() => {
    try {
      localStorage.setItem(
        SAVED,
        JSON.stringify({ places: Object.fromEntries(places.current), turn: turn.current }),
      );
    } catch {
      // Not kept in this browser; everything still works.
    }
  }, []);

  // First places: the owner's, where there are any; organic ones for the rest.
  useLayoutEffect(() => {
    const saved = load();
    const first = firstPlaces(neurons);
    places.current = new Map(
      neurons.map((n) => [n.id, saved?.places[n.id] ?? first.get(n.id) ?? [0, 0, 1]]),
    );
    if (saved?.turn) turn.current = saved.turn;
    draw();
  }, [neurons, draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  // Gestures. A grabbed neuron follows the finger; otherwise the sky turns. A drag is never a touch.
  useEffect(() => {
    let grab: { id: string; x: number; y: number; scale: number } | null = null;
    let spin: { x: number; y: number; turn: Turn } | null = null;
    const root = sky.current!;

    const down = (e: PointerEvent) => {
      moved.current = false;
      const dot = (e.target as Element).closest<HTMLElement>('[data-neuron]');
      const id = dot?.dataset.neuron;
      if (id) {
        const view = viewFor(window.innerWidth, window.innerHeight);
        const p = project(places.current.get(id)!, turn.current, view);
        grab = { id, x: e.clientX, y: e.clientY, scale: view.radius * p.scale };
        dot.setPointerCapture(e.pointerId);
      } else if (!(e.target as Element).closest('button')) {
        spin = { x: e.clientX, y: e.clientY, turn: turn.current };
      }
    };
    const move = (e: PointerEvent) => {
      if (!grab && !spin) return;
      const from = grab ?? spin!;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (!moved.current && Math.hypot(dx, dy) <= 4) return;
      moved.current = true;
      root.dataset.dragging = '';
      if (grab) {
        const tall = viewFor(window.innerWidth, window.innerHeight).tall;
        const place = places.current.get(grab.id)!;
        places.current.set(
          grab.id,
          nudge(place, turn.current, [dx / grab.scale, dy / (grab.scale * tall), 0]),
        );
        grab.x = e.clientX;
        grab.y = e.clientY;
      } else turn.current = turnBy(spin!.turn, dx * 0.006, dy * 0.006);
      draw();
    };
    const up = () => {
      if (moved.current) save();
      grab = spin = null;
      delete root.dataset.dragging;
      // The click that follows a drag still sees `moved`; the next one does not.
      setTimeout(() => (moved.current = false));
    };
    const wheel = (e: WheelEvent) => {
      const id = (e.target as Element).closest<HTMLElement>('[data-neuron]')?.dataset.neuron;
      if (!id) return;
      e.preventDefault();
      const place = places.current.get(id)!;
      places.current.set(id, nudge(place, turn.current, [0, 0, -Math.sign(e.deltaY) * 0.12]));
      draw();
      save();
    };
    const dbl = (e: MouseEvent) => {
      if ((e.target as Element).closest('button')) return;
      turn.current = FIRST_TURN;
      draw();
      save();
    };
    root.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    root.addEventListener('wheel', wheel, { passive: false });
    root.addEventListener('dblclick', dbl);
    return () => {
      root.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      root.removeEventListener('wheel', wheel);
      root.removeEventListener('dblclick', dbl);
    };
  }, [draw, save]);

  // Keyboard: arrows turn the sky; PageUp/PageDown move the focused neuron; Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setOpen(false);
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-0.12, 0],
        ArrowRight: [0.12, 0],
        ArrowUp: [0, -0.12],
        ArrowDown: [0, 0.12],
      };
      const id = (document.activeElement as HTMLElement | null)?.dataset?.neuron;
      if (arrows[e.key]) {
        e.preventDefault();
        turn.current = turnBy(turn.current, ...arrows[e.key]!);
      } else if (id && (e.key === 'PageUp' || e.key === 'PageDown')) {
        e.preventDefault();
        const step = e.key === 'PageUp' ? 0.12 : -0.12;
        places.current.set(id, nudge(places.current.get(id)!, turn.current, [0, 0, step]));
      } else return;
      draw();
      save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draw, save]);

  const speaking = open;

  return (
    <main
      ref={sky}
      className="fixed inset-0 cursor-grab touch-none select-none data-dragging:cursor-grabbing"
    >
      <h1 className="sr-only">Cerebro</h1>
      <svg
        ref={svg}
        aria-hidden
        className={`pointer-events-none absolute inset-0 size-full transition-opacity duration-300 ${speaking ? 'opacity-25' : ''}`}
      />

      {neurons.map((n) => (
        <Link
          key={n.id}
          href={`/neuron/${n.id}`}
          draggable={false}
          ref={(el) => {
            if (el) dots.current.set(n.id, el);
            else dots.current.delete(n.id);
          }}
          data-neuron={n.id}
          aria-label={n.detail ? `${n.name}, ${n.detail}` : n.name}
          // A drag is not a touch: it moved the neuron, it does not open it.
          onClick={(e) => moved.current && e.preventDefault()}
          className={`group invisible absolute top-0 left-0 -mt-[22px] -ml-[22px] grid size-11 cursor-grab place-items-center rounded-full transition-[filter] duration-300 outline-none ${speaking ? '[filter:opacity(0.25)]' : ''}`}
          style={
            {
              '--dot': n.color,
              '--w': 1 + 0.5 * n.strength,
              '--glow': n.strength,
            } as React.CSSProperties
          }
        >
          <span
            aria-hidden
            className="absolute -inset-[calc(10px*var(--w))] animate-[breathe_4s_ease-in-out_infinite] rounded-full"
            style={{
              background:
                'radial-gradient(circle, color-mix(in oklch, var(--dot) 45%, transparent), transparent 70%)',
            }}
          />
          <span
            aria-hidden
            className="relative size-2 rounded-full transition-transform duration-500 group-hover:scale-125 group-focus-visible:scale-125"
            style={{
              background: 'var(--dot)',
              boxShadow: '0 0 calc(10px + 10px * var(--glow)) var(--dot)',
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-full mb-0.5 translate-y-1 whitespace-nowrap text-(--cb-highlight) opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
          >
            {n.name}
            {n.detail && <span className="text-white/60"> · {n.detail}</span>}
          </span>
        </Link>
      ))}

      {/* The Dominus, always above what is behind it. */}
      <div className="absolute top-[calc(50%+12px)] left-1/2 z-50 -translate-x-1/2 -translate-y-1/2">
        <NeuronDot
          color={DOMINUS_COLOR}
          label={dominusLabel}
          expanded={open}
          controls="dominus-status"
          onClick={() => !moved.current && setOpen((v) => !v)}
        />
        <div
          id="dominus-status"
          role="status"
          hidden={!open}
          className="absolute top-full left-1/2 mt-3 w-[min(90vw,32rem)] -translate-x-1/2 text-center break-words"
        >
          {dominusLines.map((line) => (
            <p key={line.text} className={line.cost ? 'text-(--cb-cost)' : undefined}>
              {line.text}
            </p>
          ))}
        </div>
      </div>
    </main>
  );
}
