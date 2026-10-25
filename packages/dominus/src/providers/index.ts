import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { CorePaths } from '../paths.ts';
import { createVault } from '../vault.ts';
import { claudeCode } from './claude-code.ts';
import { openAiCompatible, type ApiConnection } from './openai-compatible.ts';
import { simulated } from './simulated.ts';
import { MODEL_ROLES, type AiProvider } from './types.ts';

// The only place that knows which adapters exist. A new kind of AI = one adapter file and one
// branch here. API connections come from connections.json in the data folder (the owner adds
// them in Settings); their keys stay in the vault.

function readConnections(file: string): ApiConnection[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is ApiConnection =>
      c?.kind === 'openai-compatible' &&
      typeof c.id === 'string' &&
      /^[a-z0-9-]{1,40}$/.test(c.id) &&
      typeof c.name === 'string' &&
      typeof c.baseUrl === 'string' &&
      /^https?:\/\//.test(c.baseUrl) &&
      MODEL_ROLES.every((r) => typeof c.models?.[r] === 'string') &&
      (c.monthlyCapUsd === undefined ||
        (typeof c.monthlyCapUsd === 'number' && c.monthlyCapUsd > 0)),
  );
}

export function loadProviders(paths: CorePaths): Map<string, AiProvider> {
  const vault = createVault();
  const list: AiProvider[] = [
    claudeCode({ textDir: path.join(paths.dir, 'conversation') }),
    ...readConnections(paths.connections).map((c) => openAiCompatible(c, vault)),
  ];
  if (process.env.CEREBRO_SIMULATED === '1') list.push(simulated());
  return new Map(list.map((p) => [p.id, p]));
}
