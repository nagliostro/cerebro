import { nowMs } from '../clock.ts';
import { BUILD_TAG, PLAN_TAG } from '../builder/prompts.ts';
import { writeText } from './file-tools.ts';
import type { AiProvider, AskEvent, AskRequest } from './types.ts';

// Simulated adapter for tests: answers at once, spends nothing, and reports an estimated quota
// window that grows with each call, so quota handling can be tested without an AI. A prompt
// with [quota-out:<ms>] behaves like a provider whose window ran out until that real time.
// It also plans (a request of fewer than 3 words gets questions) and builds a small application
// with the kit, one file at a time, so the whole way of a neuron can be tested.

const STEP_MS = Number(process.env.CEREBRO_SIM_STEP_MS ?? 400);
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(new Error('aborted'))));
  });

/** The request and what the owner said since, as the planner's prompt carries them. */
function requestOf(prompt: string) {
  const request = prompt.match(/Request:\n([^\n]*)/)?.[1] ?? '';
  const said = [...prompt.matchAll(/The owner (?:answered|asked to change):\n([^\n]*)/g)].map(
    (m) => m[1]!,
  );
  return { request, said, adjusting: prompt.match(/Adjust the existing neuron "([^"]+)"/)?.[1] };
}

function plan(prompt: string) {
  const { request, said, adjusting } = requestOf(prompt);
  if (!adjusting && request.split(/\s+/).length < 3 && !said.length)
    return {
      ready: false,
      questions: ['What should it keep track of?', 'Just for you, or shared?'],
    };
  // "Plants: water them every week" → "Plants"; otherwise the first word.
  const head = request.includes(':') ? request.split(':')[0]! : request.split(/\s+/)[0]!;
  const name = adjusting ?? head.charAt(0).toUpperCase() + head.slice(1);
  // [existing:<neuron>] answers that an existing neuron already does this.
  const existing = adjusting ? null : (request.match(/\[existing:([a-z0-9-]+)\]/)?.[1] ?? null);
  if (existing)
    return {
      ready: true,
      questions: [],
      name,
      role: 'life',
      understood: request,
      creates: [],
      existing,
    };
  return {
    ready: true,
    questions: [],
    name: name.slice(0, 24),
    role: 'life',
    understood: `${request}${said.length ? ` (${said.join('; ')})` : ''}`,
    creates: [{ name: 'Items', what: 'add and list items' }],
    collections: [{ name: 'items', fields: ['text'] }],
    // [link:<neuron>.<collection>] asks to read another neuron, to test links.
    links: [...request.matchAll(/\[link:([a-z0-9-]+)\.([a-z0-9_-]+)\]/g)].map((m) => ({
      neuron: m[1],
      collection: m[2],
      why: 'to read it',
    })),
    checks: ['An item added shows in the list'],
    limits: [],
    existing: null,
  };
}

const APP = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/neuron-kit/base.css" />
    <link rel="stylesheet" href="style.css" />
    <script src="/neuron-kit/cerebro.js"></script>
  </head>
  <body>
    <main>
      <form class="cb-linha" id="form">
        <div class="cb-campo"><input id="text" placeholder=" " required /><label for="text">Item</label></div>
        <button class="cb-botao" type="submit">Add</button>
      </form>
      <ul class="cb-lista" id="list"></ul>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`;
const SCRIPT = `const items = cerebro.data('items');
const list = document.getElementById('list');
async function show() {
  list.replaceChildren(...(await items.list()).map((i) => {
    const li = document.createElement('li');
    li.textContent = i.data.text;
    return li;
  }));
}
document.getElementById('form').onsubmit = async (e) => {
  e.preventDefault();
  await items.create({ text: document.getElementById('text').value });
  e.target.reset();
  cerebro.notify('Saved');
  show();
};
show();
`;

async function build(req: AskRequest, emit: (e: AskEvent) => void) {
  // What was asked shows in the application, so a test can tell one version from another.
  const asked = (req.prompt.match(/The owner asked: ([^\n]*)/)?.[1] ?? '').replace(/[<>&]/g, '');
  const color = req.prompt.match(/The neuron's color: (oklch\([^)]*\))/)?.[1] ?? 'white';
  // [build-fail] in the request makes it write nothing usable, to test a failed build.
  const files: [string, string][] = req.prompt.includes('[build-fail]')
    ? [['notes.txt', 'nothing']]
    : [
        ['index.html', APP.replace('<main>', `<main>\n      <p id="asked">${asked}</p>`)],
        ['style.css', `:root { --cb-cor: ${color}; }\n`],
        ['app.js', SCRIPT],
      ];
  for (const [file, content] of files) {
    emit({ type: 'tool', action: 'write', target: file });
    await sleep(STEP_MS, req.signal);
    await writeText(req.cwd!, file, content);
  }
  return 'Built a list of items.';
}

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
      let text: string;
      if (req.system?.startsWith(PLAN_TAG)) {
        await sleep(STEP_MS, req.signal);
        text = JSON.stringify(plan(req.prompt));
      } else if (req.system?.startsWith(BUILD_TAG) && req.cwd)
        text = await build(req, (e) => onEvent?.(e));
      else text = `echo(${req.role}, ${req.mode}): ${req.prompt}`;
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
