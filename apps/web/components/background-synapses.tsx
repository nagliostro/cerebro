'use client';

import Delaunator from 'delaunator';
import { useEffect, useRef } from 'react';

import { stars } from './starfield';

// The background while the AI works (spending tokens): synapses that stroll across the stars.
// When the work starts one appears, and another every INTERVAL, up to the limit (which grows with
// the screen). Each hops from star to neighboring star, following a heading that turns slowly,
// and leaves a trail that fades. The longer the work, the more synapses stroll. Drawn on a
// <canvas>, and only while there is work or a trail still fading: at rest it costs nothing.
//
// They never cross, with no intersection math: they walk only along the edges of the Delaunay
// triangulation of the stars (Delaunator, by Mapbox), a planar graph, whose edges meet only at
// their ends. Each star stays reserved for the synapse that passed by while its trail is lit
// (the pattern of several walkers that mark visited vertices). With no way out, a synapse fades
// and another is born in the emptiest part.

const WIDTH = 1600; // the Starfield's viewBox
const HEIGHT = 1000;
const INTERVAL = 2200; // ms between one new synapse and the next
const LIMIT = 14; // synapses on a full screen (1600 × 1000 visible)
const SPEED = 150; // viewBox units per second
const TRAIL = 2600; // ms until a walked stretch fades
const GLOW = 1200; // ms a visited star glows

type Stretch = { a: number; b: number; born: number };
type Stroll = {
  trail: Stretch[];
  from: number;
  to: number;
  t: number; // 0 → 1 along the current stretch
  heading: number; // preferred angle
  visited: number[];
  dead: number | null; // when it ran out of way
};

/** The middle and near stars, and the neighbors of each in the Delaunay triangulation. */
const NODES = stars.flatMap((s, i) => (s.r >= 0.6 ? [i] : []));
const NEIGHBORS = (() => {
  const map = new Map<number, number[]>(NODES.map((i) => [i, []]));
  const { triangles } = Delaunator.from(NODES.map((i) => [stars[i]!.x, stars[i]!.y]));
  for (let t = 0; t < triangles.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = NODES[triangles[t + k]!]!;
      const b = NODES[triangles[t + ((k + 1) % 3)]!]!;
      // Edges too long (at the rim of the triangulation) do not look like synapses.
      if (Math.hypot(stars[a]!.x - stars[b]!.x, stars[a]!.y - stars[b]!.y) > 230) continue;
      if (!map.get(a)!.includes(b)) map.get(a)!.push(b);
      if (!map.get(b)!.includes(a)) map.get(b)!.push(a);
    }
  return map;
})();

const dot = (i: number) => stars[i]!;

/** Starts the animation on the canvas; returns how to stop it. It stops on its own when the work
    ends and the last trail fades (then calls onFinish). */
function animate(
  canvas: HTMLCanvasElement,
  activeRef: { current: boolean },
  onFinish: () => void,
): (() => void) | null {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const ctx: CanvasRenderingContext2D = context;
  const slow = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;

  let strolls: Stroll[] = [];
  let lastNew = -Infinity;
  let previous = performance.now();
  let frame = 0;

  // The visible part of the viewBox (the sky crops its edges to cover the screen).
  let visible = { x0: 0, y0: 0, x1: WIDTH, y1: HEIGHT };
  const measure = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const scale = Math.max(w / WIDTH, h / HEIGHT);
    const dx = (w - WIDTH * scale) / 2;
    const dy = (h - HEIGHT * scale) / 2;
    visible = { x0: -dx / scale, y0: -dy / scale, x1: (w - dx) / scale, y1: (h - dy) / scale };
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * dx, dpr * dy);
  };
  measure();
  window.addEventListener('resize', measure);

  const inside = (i: number, slack = 0) => {
    const p = dot(i);
    return (
      p.x > visible.x0 + slack &&
      p.x < visible.x1 - slack &&
      p.y > visible.y0 + slack &&
      p.y < visible.y1 - slack
    );
  };
  const limit = () => {
    const area = (visible.x1 - visible.x0) * (visible.y1 - visible.y0);
    return Math.max(5, Math.round((LIMIT * area) / (WIDTH * HEIGHT)));
  };

  /** Stars reserved by the other synapses: those of the lit trail and of the current stretch. */
  const reserved = (now: number, except?: Stroll) =>
    new Set(
      strolls.flatMap((p) =>
        p === except
          ? []
          : [
              ...p.trail.filter((s) => now - s.born < TRAIL).flatMap((s) => [s.a, s.b]),
              ...(p.dead === null ? [p.from, p.to] : []),
            ],
      ),
    );

  function next(p: Stroll, now: number): number | null {
    const others = reserved(now, p);
    const here = dot(p.to);
    // Near the visible edge, the heading turns back into the screen.
    if (!inside(p.to, 60)) {
      const cx = (visible.x0 + visible.x1) / 2;
      const cy = (visible.y0 + visible.y1) / 2;
      p.heading = Math.atan2(cy - here.y, cx - here.x) + (Math.random() - 0.5);
    } else p.heading += (Math.random() - 0.5) * 0.7;

    let best: number | null = null;
    let score = -Infinity;
    for (const c of NEIGHBORS.get(p.to) ?? []) {
      if (p.visited.includes(c) || others.has(c)) continue;
      const q = dot(c);
      const aligned = Math.cos(Math.atan2(q.y - here.y, q.x - here.x) - p.heading);
      const n = aligned + Math.random() * 0.8;
      if (n > score) [best, score] = [c, n];
    }
    return score > -0.6 ? best : null;
  }

  /** A new synapse on the visible star farthest from the others. */
  function spawn(now: number) {
    const heads = strolls.filter((p) => p.dead === null).map((p) => dot(p.to));
    const others = reserved(now);
    let choice: { from: number; to: number } | null = null;
    let distance = -1;
    for (let attempt = 0; attempt < 24; attempt++) {
      const from = NODES[Math.floor(Math.random() * NODES.length)]!;
      if (!inside(from, 40) || others.has(from)) continue;
      const near = (NEIGHBORS.get(from) ?? []).filter((c) => inside(c) && !others.has(c));
      if (!near.length) continue;
      const p = dot(from);
      const d = Math.min(Infinity, ...heads.map((c) => Math.hypot(c.x - p.x, c.y - p.y)));
      if (d > distance) {
        distance = d;
        choice = { from, to: near[Math.floor(Math.random() * near.length)]! };
      }
    }
    if (!choice) return;
    const a = dot(choice.from);
    const b = dot(choice.to);
    strolls.push({
      trail: [],
      ...choice,
      t: 0,
      heading: Math.atan2(b.y - a.y, b.x - a.x),
      visited: [choice.from],
      dead: null,
    });
  }

  function draw(now: number) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.lineCap = 'round';

    for (const p of strolls) {
      // The trail: each walked stretch fades with time.
      for (const s of p.trail) {
        const life = 1 - (now - s.born) / TRAIL;
        if (life <= 0) continue;
        const a = dot(s.a);
        const b = dot(s.b);
        ctx.strokeStyle = `rgba(255,255,255,${(0.3 * life).toFixed(3)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // The star it arrived at glows for a moment.
        const glow = 1 - (now - s.born) / GLOW;
        if (glow > 0) {
          ctx.fillStyle = `rgba(255,255,255,${(0.7 * glow).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (p.dead !== null) continue;

      // The current stretch and the synapse's head, with a halo.
      const a = dot(p.from);
      const b = dot(p.to);
      const x = a.x + (b.x - a.x) * p.t;
      const y = a.y + (b.y - a.y) * p.t;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      const halo = ctx.createRadialGradient(x, y, 0, x, y, 7);
      halo.addColorStop(0, 'rgba(255,255,255,0.55)');
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step(now: number) {
    const dt = Math.min(64, now - previous);
    previous = now;

    // While the AI works, a new synapse is born every interval, up to the limit.
    const live = strolls.filter((p) => p.dead === null).length;
    if (activeRef.current && live < limit() && now - lastNew > INTERVAL) {
      spawn(now);
      lastNew = now;
    }

    for (const p of strolls) {
      if (p.dead !== null) continue;
      if (!activeRef.current) {
        p.dead = now; // the work is over: it stops and lets the trail fade
        continue;
      }
      const a = dot(p.from);
      const b = dot(p.to);
      p.t += (SPEED * slow * dt) / 1000 / Math.hypot(b.x - a.x, b.y - a.y);
      if (p.t < 1) continue;
      p.trail.push({ a: p.from, b: p.to, born: now });
      p.trail = p.trail.filter((s) => now - s.born < TRAIL);
      p.visited = [...p.visited.slice(-8), p.to];
      const c = next(p, now);
      if (c === null) {
        p.dead = now; // no way out: it fades and another is born elsewhere
        continue;
      }
      p.from = p.to;
      p.to = c;
      p.t = 0;
    }
    // Gone for good once its whole trail has faded.
    strolls = strolls.filter((p) => p.dead === null || now - p.dead < TRAIL);

    draw(now);
    if (activeRef.current || strolls.length) frame = requestAnimationFrame(step);
    else {
      stop();
      onFinish();
    }
  }

  const stop = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', measure);
  };
  frame = requestAnimationFrame((t) => {
    previous = t;
    step(t);
  });
  return stop;
}

export function BackgroundSynapses({ active }: { active: boolean }) {
  const screen = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const running = useRef<(() => void) | null>(null);

  useEffect(() => {
    activeRef.current = active;
    if (active && !running.current && screen.current)
      running.current = animate(screen.current, activeRef, () => (running.current = null));
  }, [active]);

  useEffect(() => () => running.current?.(), []);

  return (
    <canvas
      ref={screen}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 size-full"
    />
  );
}
