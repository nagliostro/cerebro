import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

import { RESEARCH_TOOLS, ResearchTools } from './tools.ts';

// The research tools as an MCP server (JSON-RPC 2.0 over stdio, one message per line), for an AI
// whose CLI speaks MCP. Started by that CLI for one research, in its folder; it ends
// when the CLI closes its input. Small on purpose: initialize, tools/list, tools/call and ping.

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    locale: { type: 'string', default: 'en' },
    'max-pages': { type: 'string', default: '25' },
  },
});
if (!values.dir) {
  process.stderr.write('--dir is required\n');
  process.exit(2);
}

const tools = new ResearchTools({
  dir: values.dir,
  locale: values.locale!,
  maxPages: Number(values['max-pages']) || 25,
});

type Message = {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
};
const reply = (id: Message['id'], result: unknown) =>
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const fail = (id: Message['id'], code: number, message: string) =>
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');

// One call at a time, in order: the browser has one page.
let queue: Promise<unknown> = Promise.resolve();

createInterface({ input: process.stdin }).on('line', (line) => {
  let msg: Message;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  queue = queue.then(() => handle(msg)).catch(() => undefined);
});

async function handle(msg: Message) {
  const { id, method, params } = msg;
  if (id === undefined) return; // a notification (initialized, canceled): nothing to answer
  if (method === 'initialize')
    return reply(id, {
      protocolVersion: (params?.protocolVersion as string) ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'cerebro', version: '1' },
    });
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list')
    return reply(id, {
      tools: RESEARCH_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
      })),
    });
  if (method === 'tools/call') {
    const name = String(params?.name ?? '');
    const args = (params?.arguments ?? {}) as Record<string, unknown>;
    const r = await tools.run(name, args);
    const content: object[] = [{ type: 'text', text: r.output }];
    if (r.image)
      content.push({ type: 'image', data: r.image.toString('base64'), mimeType: 'image/png' });
    return reply(id, { content, isError: r.output.startsWith('error:') });
  }
  fail(id, -32601, `unknown method ${method}`);
}

process.stdin.on('end', async () => {
  await queue;
  await tools.close();
  process.exit(0);
});
