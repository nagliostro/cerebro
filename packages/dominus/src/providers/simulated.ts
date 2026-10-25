import { nowMs } from '../clock.ts';
import type { AiProvider } from './types.ts';

// Simulated adapter for tests: answers at once, spends nothing, and reports an estimated quota
// window that grows with each call, so quota handling can be tested without an AI. A prompt
// with [quota-out:<ms>] behaves like a provider whose window ran out until that real time.

export function simulated(): AiProvider {
  let used = 0;
  return {
    id: 'simulated',
    name: 'Simulated',
    capabilities: {
      billing: 'local',
      modes: ['text', 'agent'],
      sessions: false,
      quotaSource: 'estimated',
      windows: [{ name: 'month', lengthMs: 30 * 86_400_000 }],
    },
    check: async () => ({ ok: true, version: 'test' }),
    async ask(req, onEvent) {
      const out = Number(req.prompt.match(/\[quota-out:(\d+)\]/)?.[1] ?? 0);
      if (nowMs() < out) {
        const resetsAt = new Date(out).toISOString();
        onEvent?.({
          type: 'quota',
          windows: [{ name: 'month', used: 1, resetsAt, source: 'estimated', blocked: true }],
        });
        throw new Error('quota ran out');
      }
      used = Math.min(1, used + 0.1);
      onEvent?.({
        type: 'quota',
        windows: [{ name: 'month', used, resetsAt: null, source: 'estimated', blocked: false }],
      });
      const text = `echo(${req.role}, ${req.mode}): ${req.prompt}`;
      onEvent?.({ type: 'text', text });
      return {
        text,
        model: `sim-${req.role}`,
        inputTokens: req.prompt.length,
        outputTokens: text.length,
        costUsd: 0,
        durationMs: 1,
      };
    },
  };
}
