import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

import { aiStatus } from './ai-status';

// What the Dominus says about the AIs, from the core's answers (mocked here: the screen tests run
// with the simulated AI, so the "none connected" case is checked here).

const answers = new Map<string, unknown>();
vi.mock('@cerebro/dominus/client', () => ({
  coreRequest: async (_: string, path: string) => {
    if (!answers.has(path)) throw new Error('core down');
    return answers.get(path);
  },
}));

const claude = (health: object) => ({
  id: 'claude-code',
  name: 'Claude Code',
  capabilities: {},
  health,
});

describe('the AI status', () => {
  beforeEach(() => answers.clear());

  it('says no AI is connected, and what is missing in each', async () => {
    answers.set('/providers', [claude({ ok: false, problem: 'not-installed' })]);
    answers.set('/quota', []);
    expect(await aiStatus(t('pt-BR'))).toEqual([
      { text: 'Nenhuma IA conectada ainda' },
      { text: 'Claude Code não está instalado neste computador' },
    ]);
  });

  it('a ready AI with its quota line in gold', async () => {
    answers.set('/providers', [claude({ ok: true, version: '2.1.0' })]);
    answers.set('/quota', [
      {
        provider: 'claude-code',
        name: 'Claude Code',
        windows: [{ name: 'session', used: 0.08, pace: null, stale: false }],
      },
    ]);
    expect(await aiStatus(t('en'))).toEqual([
      { text: 'AI connected: Claude Code 2.1.0' },
      { text: 'Claude Code: session 8%', cost: true },
    ]);
  });

  it('the core down is said plainly', async () => {
    expect(await aiStatus(t('pt-BR'))).toEqual([
      { text: 'O Dominus não respondeu; reinicie o Cerebro' },
    ]);
  });
});
