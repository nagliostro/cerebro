import { DatabaseSync } from 'node:sqlite';

import { nowMs } from './clock.ts';

// The graph of the owner's life: neurons (an area or a goal, each an application of its own) and
// synapses between every pair of them and with the Dominus (a complete graph). A synapse is not
// stored: only the conversations are, at most one per pair per day, and its weight is read from
// them, so it grows with use and fades without it (half-life of 30 days), with no job running.
// Links are the strong form: one neuron reads another's data (with the contract, phase 6).

export const DOMINUS_ID = 'dominus';
const HALF_LIFE_DAYS = 30;
const DAY_MS = 86_400_000;

export type NeuronRole = 'life' | 'craft';

export type Neuron = {
  id: string;
  name: string;
  color: string;
  /** life: keeps the owner's life; craft: knows how to build (sits behind the Dominus). */
  role: NeuronRole;
  createdAt: number;
  /** Sum of its synapse weights; the most useful neuron shines the most. */
  weight: number;
};

export type Synapse = { a: string; b: string; weight: number };
export type Link = { reader: string; target: string };
export type GraphView = { neurons: Neuron[]; synapses: Synapse[]; links: Link[] };

// Neuron colors: hues around the circle, skipping violet, lavender and the magenta next to them
// (265..345), which read as "made by an AI" (the owner's rule). Same lightness and chroma, so none shouts.
const FORBIDDEN_HUES: [number, number] = [265, 345];
const isAllowedHue = (h: number) =>
  h >= 0 && h < 360 && (h < FORBIDDEN_HUES[0] || h > FORBIDDEN_HUES[1]);
export const colorOf = (hue: number) => `oklch(0.78 0.11 ${Math.round(hue)})`;
const hueOf = (color: string) => Number(color.match(/^oklch\(0\.78 0\.11 (\d{1,3})\)$/)?.[1]);

/** The allowed hue farthest from every hue already in use. */
export function nextHue(used: number[]): number {
  // The first one: a calm green-teal.
  if (!used.length) return 160;
  let best = 160;
  let bestGap = -1;
  for (let h = 0; h < 360; h += 5) {
    if (!isAllowedHue(h)) continue;
    const gap = used.length
      ? Math.min(...used.map((u) => Math.min(Math.abs(h - u), 360 - Math.abs(h - u))))
      : 360;
    if (gap > bestGap) [best, bestGap] = [h, gap];
  }
  return best;
}

/** Weight of a series of conversation days: each one counts 1, halving every 30 days. */
export function decayedWeight(days: number[], now: number): number {
  return days.reduce(
    (sum, at) => sum + 0.5 ** (Math.max(0, now - at) / DAY_MS / HALF_LIFE_DAYS),
    0,
  );
}

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
const dayOf = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

export class GraphError extends Error {}

export class Graph {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 2000;
      CREATE TABLE IF NOT EXISTS neurons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        archived_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS conversations (
        a TEXT NOT NULL,
        b TEXT NOT NULL,
        day INTEGER NOT NULL,
        PRIMARY KEY (a, b, day)
      );
      CREATE TABLE IF NOT EXISTS links (
        reader TEXT NOT NULL,
        target TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (reader, target)
      );
    `);
  }

  close() {
    this.db.close();
  }

  exists(id: string) {
    return (
      id === DOMINUS_ID ||
      !!this.db.prepare(`SELECT 1 FROM neurons WHERE id = ? AND archived_at IS NULL`).get(id)
    );
  }

  /** One neuron, as the screen of its application shows it; null when it does not exist. */
  neuron(id: string): Omit<Neuron, 'weight'> | null {
    return (
      (this.db
        .prepare(
          `SELECT id, name, color, role, created_at AS createdAt FROM neurons
           WHERE id = ? AND archived_at IS NULL`,
        )
        .get(id) as Omit<Neuron, 'weight'> | undefined) ?? null
    );
  }

  addNeuron(input: { name: unknown; role?: unknown; hue?: unknown }): string {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 40) throw new GraphError('invalid name');
    const role: NeuronRole = input.role === 'craft' ? 'craft' : 'life';
    if (input.role !== undefined && input.role !== 'life' && input.role !== 'craft')
      throw new GraphError('invalid role');
    const id = this.uniqueId(name);
    const used = (this.db.prepare(`SELECT color FROM neurons`).all() as { color: string }[])
      .map((r) => hueOf(r.color))
      .filter(Number.isFinite);
    let hue = nextHue(used);
    if (input.hue !== undefined) {
      if (typeof input.hue !== 'number' || !isAllowedHue(input.hue))
        throw new GraphError('invalid hue');
      hue = input.hue;
    }
    this.db
      .prepare(`INSERT INTO neurons (id, name, color, role, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, name, colorOf(hue), role, nowMs());
    return id;
  }

  /** A readable id from the name ("Gastos da casa" → "gastos-da-casa"), unique. */
  private uniqueId(name: string) {
    const base =
      name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32) || 'neuron';
    let id = base === DOMINUS_ID ? `${base}-2` : base;
    for (let i = 2; this.db.prepare(`SELECT 1 FROM neurons WHERE id = ?`).get(id); i++)
      id = `${base}-${i}`;
    return id;
  }

  /** Two neurons (or one and the Dominus) talked today; a second time today adds nothing. */
  recordConversation(x: string, y: string, at = nowMs()) {
    if (x === y || !this.exists(x) || !this.exists(y)) throw new GraphError('unknown neuron');
    const [a, b] = pair(x, y);
    this.db
      .prepare(`INSERT OR IGNORE INTO conversations (a, b, day) VALUES (?, ?, ?)`)
      .run(a, b, dayOf(at));
  }

  addLink(reader: string, target: string) {
    if (reader === target || !this.exists(reader) || !this.exists(target))
      throw new GraphError('unknown neuron');
    this.db
      .prepare(`INSERT OR IGNORE INTO links (reader, target, created_at) VALUES (?, ?, ?)`)
      .run(reader, target, nowMs());
  }

  /** Everything the Memória draws, in one read. */
  view(now = nowMs()): GraphView {
    const rows = this.db
      .prepare(
        `SELECT id, name, color, role, created_at AS createdAt FROM neurons
         WHERE archived_at IS NULL ORDER BY created_at, id`,
      )
      .all() as Omit<Neuron, 'weight'>[];
    const alive = new Set([DOMINUS_ID, ...rows.map((r) => r.id)]);
    const days = new Map<string, number[]>();
    for (const c of this.db.prepare(`SELECT a, b, day FROM conversations`).all() as {
      a: string;
      b: string;
      day: number;
    }[]) {
      if (!alive.has(c.a) || !alive.has(c.b)) continue;
      const key = `${c.a}|${c.b}`;
      days.set(key, [...(days.get(key) ?? []), c.day]);
    }
    const round = (x: number) => Math.round(x * 10) / 10;
    const synapses = [...days].map(([key, d]) => {
      const [a, b] = key.split('|') as [string, string];
      return { a, b, weight: round(decayedWeight(d, now)) };
    });
    const weightOf = (id: string) =>
      round(synapses.filter((s) => s.a === id || s.b === id).reduce((t, s) => t + s.weight, 0));
    const links = (this.db.prepare(`SELECT reader, target FROM links`).all() as Link[]).filter(
      (l) => alive.has(l.reader) && alive.has(l.target),
    );
    return {
      neurons: rows.map((r) => ({ ...r, weight: weightOf(r.id) })),
      synapses: synapses.filter((s) => s.weight > 0),
      links,
    };
  }
}
