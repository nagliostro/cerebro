// The Cerebro's mark: a brain in profile drawn as a graph (neurons and synapses). Own drawing,
// simplified to read at icon size.

const nodes: [number, number, number][] = [
  [4, 15, 1.7],
  [7, 8.5, 1.3],
  [12.5, 5, 1.4],
  [18.5, 4, 1.2],
  [24, 6, 1.9],
  [28, 12, 1.3],
  [27, 19, 1.5],
  [21, 21.5, 1.2],
  [15, 20.5, 1.4],
  [9, 20, 1.2],
  [12, 13, 1.8],
  [19, 11.5, 1.5],
  [23, 15.5, 1.1],
  [17, 25.5, 1],
  [18.5, 29.5, 1],
];

const synapses: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 0],
  [0, 10],
  [1, 10],
  [2, 10],
  [10, 11],
  [2, 11],
  [3, 11],
  [4, 11],
  [11, 12],
  [4, 12],
  [5, 12],
  [6, 12],
  [12, 7],
  [10, 8],
  [11, 8],
  [10, 9],
  [11, 7],
  [8, 13],
  [7, 13],
  [13, 14],
  [7, 14],
];

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      {synapses.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={nodes[a]![0]}
          y1={nodes[a]![1]}
          x2={nodes[b]![0]}
          y2={nodes[b]![1]}
          stroke="currentColor"
          strokeWidth={0.8}
          opacity={0.55}
        />
      ))}
      {nodes.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="currentColor" />
      ))}
    </svg>
  );
}
