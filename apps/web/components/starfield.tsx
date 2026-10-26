// Starry background: small dots in three depth layers. The farther ones are smaller, dimmer
// and more numerous. A fixed seed makes the server and the browser draw the same sky.
//
// Light at rest: the still stars are drawn once; the few that twinkle live in four layers of
// their own, each fading as a whole. An opacity animation of a layer runs on the compositor (the
// graphics card), so a sky left open costs nothing; animating each star inside one SVG made the
// browser restyle and repaint the whole sky on every frame.

function random(seed: number) {
  // mulberry32: a small deterministic generator
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const layers = [
  { count: 260, radius: [0.35, 0.6], opacity: [0.06, 0.14] }, // far
  { count: 110, radius: [0.6, 0.9], opacity: [0.1, 0.2] }, // middle
  { count: 35, radius: [0.9, 1.3], opacity: [0.16, 0.28] }, // near
] as const;

const rand = random(19);
const between = ([min, max]: readonly [number, number]) => min + rand() * (max - min);

export const stars = layers.flatMap((layer) =>
  Array.from({ length: layer.count }, () => ({
    x: rand() * 1600,
    y: rand() * 1000,
    r: between(layer.radius),
    o: between(layer.opacity),
    // One in eight twinkles slowly, in one of the four layers.
    twinkle: rand() < 0.125 ? Math.floor(rand() * 4) : null,
  })),
);

/** The rhythm of each twinkling layer: never in step with another. */
const RHYTHMS = [
  { dur: 6.5, delay: 0 },
  { dur: 8.2, delay: 1.7 },
  { dur: 9.6, delay: 3.1 },
  { dur: 11.3, delay: 0.9 },
];

const SKY = 'pointer-events-none fixed inset-0 -z-10 size-full';

function Dots({ list }: { list: typeof stars }) {
  return list.map((s, i) => (
    <circle
      key={i}
      cx={s.x.toFixed(1)}
      cy={s.y.toFixed(1)}
      r={s.r.toFixed(2)}
      fill="white"
      opacity={s.o.toFixed(3)}
    />
  ));
}

export function Starfield() {
  return (
    <>
      <svg aria-hidden viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className={SKY}>
        <Dots list={stars.filter((s) => s.twinkle === null)} />
      </svg>
      {RHYTHMS.map((r, layer) => (
        <svg
          key={layer}
          aria-hidden
          viewBox="0 0 1600 1000"
          preserveAspectRatio="xMidYMid slice"
          className={`${SKY} animate-[twinkle-layer_var(--dur)_ease-in-out_infinite] will-change-[opacity]`}
          style={{ '--dur': `${r.dur}s`, animationDelay: `${r.delay}s` } as React.CSSProperties}
        >
          <Dots list={stars.filter((s) => s.twinkle === layer)} />
        </svg>
      ))}
    </>
  );
}
