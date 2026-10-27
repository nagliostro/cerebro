import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decayedWeight, Graph, nextHue } from '../src/graph.ts';

const DAY = 86_400_000;
let dir: string;
let graph: Graph;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-graph-'));
  graph = new Graph(path.join(dir, 'g.db'));
});
afterEach(async () => {
  graph.close();
  await rm(dir, { recursive: true, force: true });
});

describe('graph', () => {
  it('starts with the Dominus only', () => {
    expect(graph.view()).toEqual({ neurons: [], synapses: [], links: [] });
  });

  it('gives each neuron a readable id and a color of its own, never violet', () => {
    const ids = ['Gastos da casa', 'Gastos da casa', 'Agenda', 'Saúde'].map((name) =>
      graph.addNeuron({ name }),
    );
    expect(ids).toEqual(['gastos-da-casa', 'gastos-da-casa-2', 'agenda', 'saude']);
    const hues = graph.view().neurons.map((n) => Number(n.color.match(/(\d+)\)$/)![1]));
    expect(new Set(hues).size).toBe(4);
    for (const h of hues) expect(h < 265 || h > 345).toBe(true);
    expect(() => graph.addNeuron({ name: 'x', hue: 290 })).toThrow('invalid hue');
    expect(() => graph.addNeuron({ name: '' })).toThrow('invalid name');
  });

  it('weighs a synapse by its conversations, one per day, fading by half in 30 days', () => {
    const a = graph.addNeuron({ name: 'Finanças' });
    const b = graph.addNeuron({ name: 'Agenda' });
    const now = Date.UTC(2026, 9, 24, 12);
    graph.recordConversation(a, b, now);
    graph.recordConversation(b, a, now + 1000); // same day, same pair: nothing new
    graph.recordConversation(a, 'dominus', now);
    const view = graph.view(now);
    expect(view.synapses).toHaveLength(2);
    expect(view.neurons.find((n) => n.id === a)?.weight).toBe(2);
    expect(graph.view(now + 30 * DAY).synapses[0]?.weight).toBe(0.5);
    expect(() => graph.recordConversation(a, 'ghost')).toThrow('unknown neuron');
  });

  it('keeps what the Dominus did with a neuron, newest first, and forgets it with the neuron', () => {
    const a = graph.addNeuron({ name: 'Finanças' });
    graph.recordUse(a, { kind: 'built', request: 'organize my spending' }, 1000);
    graph.recordUse(a, { kind: 'adjusted', request: 'add a chart', ok: false }, 2000);
    const { total, items } = graph.uses(a);
    expect(total).toBe(2);
    expect(items.map((u) => [u.kind, u.ok])).toEqual([
      ['adjusted', false],
      ['built', true],
    ]);
    expect(graph.uses(a, 1).items).toHaveLength(1);
    expect(() => graph.recordUse('ghost', { kind: 'built', request: 'x' })).toThrow(
      'unknown neuron',
    );
    graph.removeNeuron(a);
    expect(graph.uses(a)).toEqual({ total: 0, items: [] });
  });

  it('keeps links: one neuron reads another', () => {
    const a = graph.addNeuron({ name: 'Finanças' });
    const b = graph.addNeuron({ name: 'Agenda' });
    graph.addLink(a, b);
    expect(graph.view().links).toEqual([{ reader: a, target: b }]);
  });

  it('picks the hue farthest from those in use', () => {
    expect(nextHue([])).toBe(160);
    expect(nextHue([160])).toBe(350);
    expect(decayedWeight([0, 0], 0)).toBe(2);
  });
});
