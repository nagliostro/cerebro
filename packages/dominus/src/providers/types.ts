// The Dominus vocabulary for talking to any AI. Nothing outside providers/ knows which AI is
// behind it: the core asks for a role ("cheap"), never a model name, and reads quota as generic
// windows, never a provider's own event. Each adapter translates both ways.

/** What the task needs, not which model does it. Each provider maps roles to its own models. */
export type ModelRole = 'cheap' | 'balanced' | 'strong';
export const MODEL_ROLES: readonly ModelRole[] = ['cheap', 'balanced', 'strong'];

/**
 * text: just an answer, without tools or project context, so short tasks do not pay an agent's
 * fixed cost. agent: tools and a working folder, to research, read or change files.
 */
export type AskMode = 'text' | 'agent';

export type Capabilities = {
  /** plan: a subscription through the provider's official CLI; api: paid per token; local: free. */
  billing: 'plan' | 'api' | 'local';
  /** The modes this connection can run. Building a neuron needs agent. */
  modes: readonly AskMode[];
  /** Can continue a previous conversation by id. */
  sessions: boolean;
  /** Where quota readings come from: the provider itself, the Dominus's estimate, or nowhere. */
  quotaSource: 'official' | 'estimated' | 'none';
};

/** One usage limit, normalized. A plan: session and week; an API: month cap or balance. */
export type QuotaWindow = {
  name: 'session' | 'day' | 'week' | 'month' | 'balance';
  /** 0..1 of the window already used. */
  used: number;
  /** ISO time, as the provider gave it. */
  resetsAt: string | null;
  source: 'official' | 'estimated';
  /** The provider refused the last request because this window ran out. */
  blocked: boolean;
};

export type AskRequest = {
  prompt: string;
  role: ModelRole;
  mode: AskMode;
  system?: string;
  /** How hard the model should think. Providers without the notion ignore it. */
  effort?: 'low' | 'medium' | 'high';
  /** Agent mode: the only folder it may work in. */
  cwd?: string;
  /** Continue this conversation (only if capabilities.sessions). */
  sessionId?: string;
  signal?: AbortSignal;
};

/** Progress while the AI works, in Dominus terms. */
export type AskEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'quota'; windows: QuotaWindow[] };

export type AskResult = {
  text: string;
  /** The provider's actual model, for the record (learning which one solved what). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** null when unknown or free; for plans, the equivalent API price the provider reports. */
  costUsd: number | null;
  durationMs: number;
  sessionId?: string;
};

/**
 * Is it ready? Problems are codes, not sentences: the screen says them in the owner's language.
 * `detail` carries what the sentence needs (a command, a version, the HTTP status).
 */
export type HealthCheck =
  | { ok: true; version: string }
  | {
      ok: false;
      problem: 'not-installed' | 'not-logged-in' | 'no-key' | 'bad-key' | 'unreachable';
      detail?: string;
    };

export interface AiProvider {
  /** Stable id of this connection, used in jobs and quota. */
  id: string;
  /** What the owner sees, e.g. "Claude Code" or "OpenAI". */
  name: string;
  capabilities: Capabilities;
  check(): Promise<HealthCheck>;
  ask(req: AskRequest, onEvent?: (e: AskEvent) => void): Promise<AskResult>;
  /**
   * A fresh quota reading without spending tokens, when the provider offers one. Some only
   * report quota during ask, as `quota` events.
   */
  readQuota?(): Promise<QuotaWindow[]>;
}
