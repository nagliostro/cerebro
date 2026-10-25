import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { claudeCode, quotaFromEvent } from '../src/providers/claude-code.ts';
import { openAiCompatible, type ApiConnection } from '../src/providers/openai-compatible.ts';
import type { AskEvent } from '../src/providers/types.ts';
import { createVault, type SecretStore } from '../src/vault.ts';

// Each adapter against a fake of what it talks to: a fake CLI that prints the stream-json lines
// the real one prints, and a fake server that answers like the OpenAI format.

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-providers-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('claude code adapter', () => {
  it('turns the rate limit event into generic windows', () => {
    const windows = quotaFromEvent({
      rate_limit_info: {
        status: 'rejected',
        rateLimitType: 'five_hour',
        unifiedWindows: {
          five_hour: { utilization: 1, resetsAt: 1_800_000_000 },
          seven_day: { utilization: 0.4, resetsAt: 1_800_300_000 },
          other: { utilization: 0.1 },
        },
      },
    });
    expect(windows).toEqual([
      {
        name: 'session',
        used: 1,
        resetsAt: '2027-01-15T08:00:00.000Z',
        source: 'official',
        blocked: true,
      },
      {
        name: 'week',
        used: 0.4,
        resetsAt: '2027-01-18T19:20:00.000Z',
        source: 'official',
        blocked: false,
      },
    ]);
  });

  async function fakeCli(script: string) {
    const file = path.join(dir, `fake-${Math.random().toString(36).slice(2)}.mjs`);
    await writeFile(file, script);
    return claudeCode({ bin: [process.execPath, file], textDir: path.join(dir, 'text') });
  }

  it('asks through stdin, never the command line, and reads the stream', async () => {
    const provider = await fakeCli(`
      let prompt = '';
      process.stdin.on('data', (d) => (prompt += d));
      process.stdin.on('end', () => {
        const out = (o) => console.log(JSON.stringify(o));
        out({ type: 'system', subtype: 'init', model: 'claude-haiku-test' });
        out({ type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.2 } } } });
        out({ type: 'assistant', message: { content: [{ type: 'text', text: 'args=' + process.argv.slice(2).includes(prompt) }] } });
        out({ type: 'result', result: 'echo:' + prompt, usage: { input_tokens: 3, cache_read_input_tokens: 10, output_tokens: 2 }, total_cost_usd: 0.001, duration_ms: 5, session_id: 's1' });
      });`);
    const events: AskEvent[] = [];
    const result = await provider.ask(
      { prompt: 'hi; rm -rf /', role: 'cheap', mode: 'text' },
      (e) => events.push(e),
    );
    expect(result).toMatchObject({
      text: 'echo:hi; rm -rf /',
      model: 'claude-haiku-test',
      inputTokens: 13,
      outputTokens: 2,
      sessionId: 's1',
    });
    expect(events).toContainEqual({ type: 'text', text: 'args=false' });
    expect(events.find((e) => e.type === 'quota')).toBeTruthy();
  });

  it('never runs an agent without a folder of its own', async () => {
    const provider = await fakeCli('');
    await expect(provider.ask({ prompt: 'x', role: 'cheap', mode: 'agent' })).rejects.toThrow(
      'working folder',
    );
  });

  it('builds with files only: file tools, edits only in its folder, none of the owner settings', async () => {
    const provider = await fakeCli(`
      process.stdin.resume();
      process.stdin.on('end', () => {
        const out = (o) => console.log(JSON.stringify(o));
        const tool = (name, input) => ({ type: 'tool_use', name, input });
        out({ type: 'assistant', message: { content: [
          tool('Write', { file_path: process.cwd() + '/index.html' }),
          tool('Read', { file_path: 'app.js' }),
          tool('Glob', { pattern: '*' }),
          tool('Edit', { file_path: '../elsewhere.txt' }),
        ] } });
        out({ type: 'result', result: process.argv.slice(2).join(' '), usage: {} });
      });`);
    const cwd = path.join(dir, 'draft');
    const events: AskEvent[] = [];
    const result = await provider.ask(
      { prompt: 'build', role: 'balanced', mode: 'agent', access: 'files', cwd },
      (e) => events.push(e),
    );
    expect(result.text).toContain(
      '--tools Read,Write,Edit,Glob,Grep --permission-mode acceptEdits',
    );
    expect(result.text).toContain(
      '--strict-mcp-config --setting-sources  --disable-slash-commands',
    );
    expect(events.filter((e) => e.type === 'tool')).toEqual([
      { type: 'tool', action: 'write', target: 'index.html' },
      { type: 'tool', action: 'read', target: 'app.js' },
      { type: 'tool', action: 'search' },
      { type: 'tool', action: 'write', target: undefined },
    ]);
  });

  it('says when it is missing or not logged in', async () => {
    const missing = claudeCode({ bin: [path.join(dir, 'nothing')], textDir: dir });
    expect(await missing.check()).toMatchObject({ ok: false, problem: 'not-installed' });
    const loggedOut = await fakeCli(`
      if (process.argv.includes('--version')) console.log('9.9.9 (Claude Code)');
      else console.log(JSON.stringify({ loggedIn: false }));`);
    expect(await loggedOut.check()).toMatchObject({ ok: false, problem: 'not-logged-in' });
    const ready = await fakeCli(`
      if (process.argv.includes('--version')) console.log('9.9.9 (Claude Code)');
      else console.log(JSON.stringify({ loggedIn: true }));`);
    expect(await ready.check()).toEqual({ ok: true, version: '9.9.9' });
  });
});

describe('openai-compatible adapter', () => {
  let server: Server;
  let baseUrl: string;
  const seen: { auth?: string; body?: Record<string, unknown> } = {};

  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.auth = req.headers.authorization;
      if (req.headers.authorization !== 'Bearer sk-good') {
        res.writeHead(401).end('{"error":"bad key"}');
        return;
      }
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"data":[]}');
        return;
      }
      let s = '';
      req.on('data', (d) => (s += d));
      req.on('end', () => {
        seen.body = JSON.parse(s);
        if (seen.body!.tools) {
          // Agent mode: the first turn asks for two writes (one outside the folder), then it ends.
          const turn = (seen.body!.messages as object[]).filter(
            (m) => (m as { role: string }).role === 'assistant',
          ).length;
          const call = (id: string, file: string) => ({
            id,
            type: 'function',
            function: {
              name: 'write_file',
              arguments: JSON.stringify({ path: file, content: 'hi' }),
            },
          });
          const message =
            turn === 0
              ? {
                  role: 'assistant',
                  content: null,
                  tool_calls: [call('a', 'index.html'), call('b', '../out.txt')],
                }
              : { role: 'assistant', content: 'Built it.' };
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              model: 'mid-1',
              choices: [{ message }],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            }),
          );
          return;
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const send = (o: object) => res.write(`data: ${JSON.stringify(o)}\n\n`);
        send({ model: 'small-1', choices: [{ delta: { content: 'Hel' } }] });
        send({ model: 'small-1', choices: [{ delta: { content: 'lo' } }] });
        send({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 2 } });
        res.end('data: [DONE]\n\n');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  const connection = (): ApiConnection => ({
    id: 'test-api',
    kind: 'openai-compatible',
    name: 'Test API',
    baseUrl,
    models: { cheap: 'small-1', balanced: 'mid-1', strong: 'big-1' },
    keyName: 'connection:test-api',
  });
  const vaultWith = (key?: string) => {
    const store: SecretStore = {
      get: async () => key ?? null,
      set: async () => {},
      delete: async () => true,
    };
    return createVault(store);
  };

  it('streams the answer, with the key from the vault and the model of the role', async () => {
    const provider = openAiCompatible(connection(), vaultWith('sk-good'));
    const pieces: string[] = [];
    const result = await provider.ask(
      { prompt: 'hi', role: 'cheap', mode: 'text', system: 'be brief' },
      (e) => e.type === 'text' && pieces.push(e.text),
    );
    expect(seen.auth).toBe('Bearer sk-good');
    expect(seen.body).toMatchObject({
      model: 'small-1',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
      ],
    });
    expect(pieces).toEqual(['Hel', 'lo']);
    expect(result).toMatchObject({
      text: 'Hello',
      model: 'small-1',
      inputTokens: 7,
      outputTokens: 2,
      costUsd: null,
    });
  });

  it('says what is wrong with the key, without showing it', async () => {
    expect(await openAiCompatible(connection(), vaultWith()).check()).toMatchObject({
      ok: false,
      problem: 'no-key',
    });
    const bad = await openAiCompatible(connection(), vaultWith('sk-bad')).check();
    expect(bad).toMatchObject({ ok: false, problem: 'bad-key' });
    expect(JSON.stringify(bad)).not.toContain('sk-bad');
    expect(await openAiCompatible(connection(), vaultWith('sk-good')).check()).toEqual({
      ok: true,
      version: 'Test API',
    });
  });

  it('runs an agent with files only, inside its folder, the Cerebro running the tools', async () => {
    const provider = openAiCompatible(connection(), vaultWith('sk-good'));
    expect(provider.capabilities.modes).toEqual(['text', 'agent']);
    await expect(provider.ask({ prompt: 'x', role: 'cheap', mode: 'agent' })).rejects.toThrow(
      /only with files/,
    );
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'cerebro-agent-'));
    const events: AskEvent[] = [];
    const result = await provider.ask(
      { prompt: 'build', role: 'balanced', mode: 'agent', access: 'files', cwd },
      (e) => events.push(e),
    );
    expect(result).toMatchObject({ text: 'Built it.', inputTokens: 20, outputTokens: 10 });
    expect(readFileSync(path.join(cwd, 'index.html'), 'utf8')).toBe('hi');
    expect(existsSync(path.join(cwd, '..', 'out.txt'))).toBe(false);
    expect(events).toContainEqual({ type: 'tool', action: 'write', target: 'index.html' });
    const answers = (seen.body!.messages as { role: string; content: string }[]).filter(
      (m) => m.role === 'tool',
    );
    expect(answers.map((m) => m.content)).toEqual([
      'wrote index.html',
      'error: outside the folder',
    ]);
    await rm(cwd, { recursive: true, force: true });
  });
});
