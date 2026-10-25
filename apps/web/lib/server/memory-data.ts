import { coreRequest } from '@/lib/server/core';

import type { MemoryNeuron } from '@/components/memory';
import type { Messages } from '@/lib/i18n';

type GraphView = {
  neurons: { id: string; name: string; color: string; role: 'life' | 'craft'; weight: number }[];
  synapses: { a: string; b: string; weight: number }[];
  links: { reader: string; target: string }[];
};

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The graph as the Memória draws it, in the owner's language. Empty when the core is down. */
export async function memoryData(m: Messages) {
  let graph: GraphView;
  let down = false;
  try {
    graph = await coreRequest<GraphView>('GET', '/graph');
  } catch {
    // Not "no neurons": the Dominus did not answer, and the status already says so.
    graph = { neurons: [], synapses: [], links: [] };
    down = true;
  }
  const heaviest = Math.max(0, ...graph.neurons.map((n) => n.weight));
  // A synapse at full brightness from about 3 conversations of recent weight.
  const synapses = Object.fromEntries(
    graph.synapses.map((s) => [pairKey(s.a, s.b), Math.min(1, s.weight / 3)]),
  );
  const neurons: MemoryNeuron[] = graph.neurons.map((n) => {
    const detail = n.weight > 0 ? m.weight(m.number(n.weight)) : null;
    return {
      id: n.id,
      name: n.name,
      color: n.color,
      role: n.role,
      strength: heaviest > 0 ? n.weight / heaviest : 0,
      detail,
    };
  });
  return {
    neurons,
    synapses,
    links: graph.links.map((l) => pairKey(l.reader, l.target)),
    count: down
      ? null
      : m.neuronCount(neurons.length, neurons.filter((n) => n.role === 'craft').length),
  };
}
