import { readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';

import type { Vault } from '../vault.ts';
import type { ApiConnection } from './openai-compatible.ts';
import { MODEL_ROLES, type ModelRole } from './types.ts';

// The owner's API connections (Settings → Connections): where each one sends, which model plays
// each role and, in the vault, its key. The file never holds a key; the screen never gets one back.

export class ConnectionError extends Error {}

/** Ready-made starting points; the owner may change any field. */
export const PRESETS: Record<
  string,
  {
    name: string;
    baseUrl: string;
    models: Record<ModelRole, string>;
    key: boolean;
    billing: 'api' | 'local';
  }
> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: { cheap: 'gpt-4.1-mini', balanced: 'gpt-4.1', strong: 'o3' },
    key: true,
    billing: 'api',
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: { cheap: 'claude-haiku-5-5', balanced: 'claude-sonnet-5-5', strong: 'claude-opus-5-5' },
    key: true,
    billing: 'api',
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: {
      cheap: 'gemini-2.5-flash-lite',
      balanced: 'gemini-2.5-flash',
      strong: 'gemini-2.5-pro',
    },
    key: true,
    billing: 'api',
  },
  xai: {
    name: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    models: { cheap: 'grok-3-mini', balanced: 'grok-4', strong: 'grok-4' },
    key: true,
    billing: 'api',
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: {
      cheap: 'openai/gpt-4.1-mini',
      balanced: 'anthropic/claude-sonnet-4.5',
      strong: 'anthropic/claude-opus-4.1',
    },
    key: true,
    billing: 'api',
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: {
      cheap: 'llama-3.1-8b-instant',
      balanced: 'llama-3.3-70b-versatile',
      strong: 'llama-3.3-70b-versatile',
    },
    key: true,
    billing: 'api',
  },
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: { cheap: 'llama3.2', balanced: 'llama3.1', strong: 'llama3.1' },
    key: false,
    billing: 'local',
  },
};

const ID = /^[a-z0-9-]{1,40}$/;
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

export function readConnectionsFile(file: string): ApiConnection[] {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

async function save(file: string, list: ApiConnection[]) {
  await writeFile(`${file}.tmp`, JSON.stringify(list, null, 2));
  await rename(`${file}.tmp`, file);
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Adds a connection or changes one (same id); a key, when given, goes to the vault only. */
export async function upsertConnection(file: string, vault: Vault, body: Record<string, unknown>) {
  const list = readConnectionsFile(file);
  const preset = PRESETS[text(body.preset, 20)];
  const name = text(body.name, 40) || preset?.name || '';
  if (!name) throw new ConnectionError('name is required');
  const id =
    text(body.id, 40) ||
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  if (!ID.test(id) || id === 'claude-code' || id === 'simulated')
    throw new ConnectionError('invalid id');
  const before = list.find((c) => c.id === id);
  const baseUrl = (text(body.baseUrl, 300) || preset?.baseUrl || before?.baseUrl || '').replace(
    /\/+$/,
    '',
  );
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new ConnectionError('invalid address');
  }
  // https, or http only on this computer (a local server such as Ollama).
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOCAL.has(u.hostname)))
    throw new ConnectionError('the address must be https (or http on this computer)');
  const models = {} as Record<ModelRole, string>;
  const given = (body.models ?? {}) as Record<string, unknown>;
  for (const r of MODEL_ROLES) {
    models[r] = text(given[r], 100) || before?.models[r] || preset?.models[r] || '';
    if (!models[r]) throw new ConnectionError(`model for ${r} is required`);
  }
  const cap = body.monthlyCapUsd;
  if (
    cap !== undefined &&
    cap !== null &&
    cap !== '' &&
    !(typeof cap === 'number' && cap > 0 && cap < 100_000)
  )
    throw new ConnectionError('invalid monthly cap');
  const key = text(body.key, 500);
  const needsKey = preset ? preset.key : before ? !!before.keyName : !LOCAL.has(u.hostname);
  const keyName = needsKey ? `connection:${id}` : undefined;
  if (key && keyName) {
    if (!(await vault.available())) throw new ConnectionError('no-vault');
    await vault.set(keyName, key);
  }
  const conn: ApiConnection = {
    id,
    kind: 'openai-compatible',
    name,
    baseUrl,
    models,
    ...(keyName ? { keyName } : {}),
    billing: preset?.billing ?? before?.billing ?? (LOCAL.has(u.hostname) ? 'local' : 'api'),
    ...(typeof cap === 'number' ? { monthlyCapUsd: cap } : {}),
  };
  await save(file, [...list.filter((c) => c.id !== id), conn]);
  return conn;
}

export async function removeConnection(file: string, vault: Vault, id: string) {
  const list = readConnectionsFile(file);
  const conn = list.find((c) => c.id === id);
  if (!conn) return false;
  await save(
    file,
    list.filter((c) => c.id !== id),
  );
  if (conn.keyName) await vault.delete(conn.keyName).catch(() => false);
  return true;
}

/** The connections for the screen: never a key, only whether there is one. */
export async function listConnections(file: string, vault: Vault) {
  const list = readConnectionsFile(file);
  return Promise.all(
    list.map(async (c) => ({
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      models: c.models,
      billing: c.billing ?? 'api',
      monthlyCapUsd: c.monthlyCapUsd ?? null,
      needsKey: !!c.keyName,
      hasKey: c.keyName ? !!(await vault.get(c.keyName).catch(() => null)) : false,
    })),
  );
}
