// Starry background: small dots in three depth layers. The farther ones are smaller, dimmer
// and more numerous. A fixed seed makes the server and the browser draw the same sky.

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

const stars = layers.flatMap((layer) =>
  Array.from({ length: layer.count }, () => ({
    x: rand() * 1600,
    y: rand() * 1000,
    r: between(layer.radius),
    o: between(layer.opacity),
    // One in eight twinkles slowly.
    twinkle: rand() < 0.125 ? { dur: 5 + rand() * 6, delay: rand() * 8 } : null,
  })),
);

export function Starfield() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none fixed inset-0 -z-10 size-full"
    >
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x.toFixed(1)}
          cy={s.y.toFixed(1)}
          r={s.r.toFixed(2)}
          fill="white"
          opacity={s.o.toFixed(3)}
          className={s.twinkle ? 'animate-[twinkle_var(--dur)_ease-in-out_infinite]' : undefined}
          style={
            s.twinkle
              ? ({
                  '--dur': `${s.twinkle.dur.toFixed(1)}s`,
                  '--o': s.o.toFixed(3),
                  animationDelay: `${s.twinkle.delay.toFixed(1)}s`,
                } as React.CSSProperties)
              : undefined
          }
        />
      ))}
    </svg>
  );
}
