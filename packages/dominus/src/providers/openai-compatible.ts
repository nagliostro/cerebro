import type { Vault } from '../vault.ts';
import { FILE_TOOL_SPECS, runFileTool } from './file-tools.ts';
import type {
  AiProvider,
  AskEvent,
  AskRequest,
  AskResult,
  HealthCheck,
  ModelRole,
  ToolAction,
} from './types.ts';

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
  /** The most the owner wants to spend in a month, in US$. */
  monthlyCapUsd?: number;
};

type Usage = { prompt_tokens?: number; completion_tokens?: number; cost?: number };
type Message = {
  role: string;
  content: string | null;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

/** Turns of an agent before it must stop: a build writes a handful of files, not hundreds. */
const MAX_TURNS = 60;

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

  /**
   * Agent mode: the model asks for tools, the Cerebro runs them and answers, until the model gives
   * its final text. Files (inside cwd) or research (the Navegador and the research record): an API
   * model never runs a command here.
   */
  async function agent(req: AskRequest, onEvent?: (e: AskEvent) => void): Promise<AskResult> {
    if (!req.cwd || (req.access !== 'files' && req.access !== 'research'))
      throw new Error(
        `${conn.name} runs agents only with files or research, in a folder of their own`,
      );
    const cwd = req.cwd;
    if (req.access === 'files')
      return loop(req, FILE_TOOL_SPECS, (name, args) => runFileTool(cwd, name, args), onEvent);
    // Loaded only for a research: the browser stays out of every other call.
    const { ResearchTools, RESEARCH_TOOL_SPECS } = await import('../research/tools.ts');
    const research = new ResearchTools({
      dir: cwd,
      locale: req.locale ?? 'en',
      maxPages: req.maxPages ?? 25,
    });
    try {
      return await loop(
        req,
        RESEARCH_TOOL_SPECS,
        (name, args) => research.run(name, args),
        onEvent,
      );
    } finally {
      await research.close();
    }
  }

  async function loop(
    req: AskRequest,
    tools: readonly unknown[],
    runTool: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ output: string; action: ToolAction; target?: string }>,
    onEvent?: (e: AskEvent) => void,
  ): Promise<AskResult> {
    const started = performance.now();
    const messages: Message[] = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      { role: 'user', content: req.prompt },
    ];
    let model = conn.models[req.role];
    let inputTokens = 0;
    let outputTokens = 0;
    let cost: number | null = null;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: await headers(),
        signal: req.signal,
        body: JSON.stringify({ model: conn.models[req.role], messages, tools }),
      });
      if (!res.ok)
        throw new Error(`${conn.name} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as {
        model?: string;
        usage?: Usage;
        choices?: { message?: Message }[];
      };
      if (data.model) model = data.model;
      inputTokens += data.usage?.prompt_tokens ?? 0;
      outputTokens += data.usage?.completion_tokens ?? 0;
      if (typeof data.usage?.cost === 'number') cost = (cost ?? 0) + data.usage.cost;
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error(`${conn.name} gave no answer`);
      if (message.content) onEvent?.({ type: 'text', text: message.content });
      messages.push({
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      });
      if (!message.tool_calls?.length)
        return {
          text: message.content ?? '',
          model,
          inputTokens,
          outputTokens,
          costUsd: cost,
          durationMs: Math.round(performance.now() - started),
        };
      for (const call of message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          // A malformed call gets an error answer below, like any other.
        }
        const r = await runTool(call.function.name, args);
        onEvent?.({ type: 'tool', action: r.action, target: r.target });
        messages.push({ role: 'tool', tool_call_id: call.id, content: r.output });
      }
    }
    throw new Error(`${conn.name} did not finish in ${MAX_TURNS} turns`);
  }

  return {
    id: conn.id,
    name: conn.name,
    monthlyCapUsd: conn.monthlyCapUsd,
    capabilities: {
      billing: conn.billing ?? 'api',
      // Agent mode with files only: the Cerebro itself runs the file tools for the model.
      modes: ['text', 'agent'],
      sessions: false,
      quotaSource: 'none',
      // The month window, when there is a cap, is measured by the Dominus itself.
      windows: [],
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
      if (req.mode === 'agent') return agent(req, onEvent);
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
