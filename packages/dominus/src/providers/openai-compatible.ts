import type { Vault } from '../vault.ts';
import type { AiProvider, AskResult, HealthCheck, ModelRole } from './types.ts';

// API adapter for every provider that speaks the OpenAI Chat Completions format: OpenAI,
// Anthropic, Google Gemini, xAI, OpenRouter, Groq and local Ollama, among others. One adapter,
// many providers: each connection only says where to send, which models play each role and
// under which vault name its key is stored. The key is read from the vault for each call and
// never kept, logged or returned.

export type ApiConnection = {
  id: string;
  kind: 'openai-compatible';
  name: string;
  /** e.g. https://api.openai.com/v1 */
  baseUrl: string;
  models: Record<ModelRole, string>;
  /** Vault name of the key; absent for local servers that need none (Ollama). */
  keyName?: string;
  billing?: 'api' | 'local';
};

type Usage = { prompt_tokens?: number; completion_tokens?: number; cost?: number };

export function openAiCompatible(conn: ApiConnection, vault: Vault): AiProvider {
  const base = conn.baseUrl.replace(/\/+$/, '');

  async function headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (conn.keyName) {
      const key = await vault.get(conn.keyName);
      if (!key) throw new Error('no key in the vault');
      h.authorization = `Bearer ${key}`;
    }
    return h;
  }

  return {
    id: conn.id,
    name: conn.name,
    capabilities: {
      billing: conn.billing ?? 'api',
      // Agent mode needs tools run by the Cerebro itself; it comes with neuron building.
      modes: ['text'],
      sessions: false,
      quotaSource: 'none',
    },

    async check(): Promise<HealthCheck> {
      if (conn.keyName && !(await vault.get(conn.keyName).catch(() => null)))
        return { ok: false, problem: 'no-key', detail: conn.name };
      try {
        const res = await fetch(`${base}/models`, {
          headers: await headers(),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 401 || res.status === 403)
          return { ok: false, problem: 'bad-key', detail: String(res.status) };
        if (!res.ok) return { ok: false, problem: 'unreachable', detail: String(res.status) };
        return { ok: true, version: conn.name };
      } catch (e) {
        return { ok: false, problem: 'unreachable', detail: (e as Error).message };
      }
    },

    async ask(req, onEvent): Promise<AskResult> {
      if (req.mode !== 'text') throw new Error(`${conn.name} runs only in text mode`);
      const started = performance.now();
      const messages = [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        { role: 'user', content: req.prompt },
      ];
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: await headers(),
        signal: req.signal,
        body: JSON.stringify({
          model: conn.models[req.role],
          messages,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });
      if (!res.ok || !res.body)
        throw new Error(`${conn.name} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);

      // Server-sent events: "data: {json}" lines, ending with "data: [DONE]".
      let text = '';
      let model = conn.models[req.role];
      let usage: Usage = {};
      let rest = '';
      const decoder = new TextDecoder();
      for await (const chunk of res.body) {
        const lines = (rest + decoder.decode(chunk, { stream: true })).split('\n');
        rest = lines.pop() ?? '';
        for (const line of lines) {
          const data = line.startsWith('data:') ? line.slice(5).trim() : '';
          if (!data || data === '[DONE]') continue;
          let ev: {
            model?: string;
            usage?: Usage | null;
            choices?: { delta?: { content?: string | null } }[];
          };
          try {
            ev = JSON.parse(data);
          } catch {
            continue;
          }
          if (ev.model) model = ev.model;
          if (ev.usage) usage = ev.usage;
          const piece = ev.choices?.[0]?.delta?.content;
          if (piece) {
            text += piece;
            onEvent?.({ type: 'text', text: piece });
          }
        }
      }
      return {
        text,
        model,
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        // Only some providers report the price (OpenRouter); the Dominus never guesses one.
        costUsd: typeof usage.cost === 'number' ? usage.cost : null,
        durationMs: Math.round(performance.now() - started),
      };
    },
  };
}
