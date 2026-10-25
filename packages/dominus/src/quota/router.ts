import {
  MODEL_ROLES,
  type AskMode,
  type Capabilities,
  type ModelRole,
} from '../providers/types.ts';
import type { Pace } from './pace.ts';

// The Router picks the connection and the role for each request to an AI. Pure code, no AI.
// Order (dominus.md, E4): first the mode (text whenever no tools are needed, ~39x cheaper than an
// agent); then the connection: free and local, a plan whose quota would be left over, an API
// within its cap, a plan already above its pace; then the role, by what was measured to work
// and cost less for that kind of task. "Cheap" is measured, never assumed: without history the
// role is balanced, because a cheap model that thinks more cost up to 6x more (E4).

export type Candidate = {
  id: string;
  capabilities: Capabilities;
  healthy: boolean;
  windows: { name: string; used: number; blocked: boolean; pace: Pace | null }[];
  /** Past asks of the same kind on this connection. */
  history: { role: string; ok: boolean; costUsd: number | null }[];
};

export type RouteRequest = {
  mode: AskMode;
  /** The kind of task ("chat", "classify", "build"...), to learn what works for each. */
  kind?: string;
  /** The owner locked this choice by hand. */
  lock?: { provider: string; role?: ModelRole };
};

export type Reason =
  | 'locked'
  | 'local'
  | 'plan-within-pace'
  | 'api'
  | 'plan-above-pace'
  | 'measured-role'
  | 'default-role';

export type Route =
  | { ok: true; provider: string; role: ModelRole; mode: AskMode; reasons: Reason[] }
  | { ok: false; why: 'none-ready' | 'all-out-of-quota' };

/** Near this share of a window, the connection counts as out of quota. */
const FULL = 0.98;
const MIN_CALLS = 3;
const MIN_OK = 0.9;

function tier(c: Candidate): { rank: number; reason: Reason } {
  if (c.capabilities.billing === 'local') return { rank: 0, reason: 'local' };
  if (c.capabilities.billing === 'plan')
    return c.windows.some((w) => w.pace?.ahead)
      ? { rank: 3, reason: 'plan-above-pace' }
      : { rank: 1, reason: 'plan-within-pace' };
  return { rank: 2, reason: 'api' };
}

/** The role that worked (90%+ of 3+ calls) for the least money; balanced without history. */
export function pickRole(history: Candidate['history']): { role: ModelRole; reason: Reason } {
  let best: { role: ModelRole; usd: number } | null = null;
  for (const role of MODEL_ROLES) {
    const calls = history.filter((h) => h.role === role);
    if (calls.length < MIN_CALLS) continue;
    if (calls.filter((h) => h.ok).length / calls.length < MIN_OK) continue;
    const usd = calls.reduce((s, h) => s + (h.costUsd ?? 0), 0) / calls.length;
    if (!best || usd < best.usd) best = { role, usd };
  }
  return best
    ? { role: best.role, reason: 'measured-role' }
    : { role: 'balanced', reason: 'default-role' };
}

export function route(req: RouteRequest, candidates: Candidate[]): Route {
  const able = candidates.filter((c) => c.healthy && c.capabilities.modes.includes(req.mode));
  if (!able.length) return { ok: false, why: 'none-ready' };
  const usable = able.filter((c) => !c.windows.some((w) => w.blocked || w.used >= FULL));
  if (!usable.length) return { ok: false, why: 'all-out-of-quota' };

  if (req.lock) {
    const locked = usable.find((c) => c.id === req.lock!.provider);
    if (locked) {
      const role = req.lock.role ?? pickRole(locked.history).role;
      return { ok: true, provider: locked.id, role, mode: req.mode, reasons: ['locked'] };
    }
  }

  const [best] = usable
    .map((c) => ({ c, t: tier(c) }))
    .sort((a, b) => a.t.rank - b.t.rank || a.c.id.localeCompare(b.c.id));
  const role = pickRole(best!.c.history);
  return {
    ok: true,
    provider: best!.c.id,
    role: role.role,
    mode: req.mode,
    reasons: [best!.t.reason, role.reason],
  };
}
