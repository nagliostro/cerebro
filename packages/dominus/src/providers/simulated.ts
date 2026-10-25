import type { AiProvider } from './types.ts';

// Simulated adapter for tests: answers at once, spends nothing, and reports an estimated quota
// window that grows with each call, so quota handling can be tested without an AI.

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
    },
    check: async () => ({ ok: true, version: 'test' }),
    async ask(req, onEvent) {
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
