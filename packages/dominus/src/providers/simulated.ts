import { nowMs } from '../clock.ts';
import { BUILD_TAG, PLAN_TAG, RESEARCH_TAG } from '../builder/prompts.ts';
import { ANSWER_TAG } from '../builder/talk.ts';
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
  // A copy is named after the feature researched; "Plants: water them every week" → "Plants";
  // otherwise the first word.
  const researched = prompt.match(/The research of "([^"]+)"/)?.[1];
  const head =
    researched ?? (request.includes(':') ? request.split(':')[0]! : request.split(/\s+/)[0]!);
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
  // [small] asks for a small adjustment: built at once, in the file it names.
  if (adjusting && request.includes('[small]'))
    return {
      ready: true,
      questions: [],
      name,
      role: 'life',
      understood: request,
      creates: [{ name: 'Title', what: 'a new title' }],
      collections: [],
      links: [...request.matchAll(/\[link:([a-z0-9-]+)\.([a-z0-9_-]+)\]/g)].map((m) => ({
        neuron: m[1],
        collection: m[2],
        why: 'to read it',
      })),
      checks: ['The title changed'],
      limits: [],
      existing: null,
      small: true,
      files: [{ path: 'index.html', where: 'the <h1>' }],
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
    // [net:<host>] names a public site it reads live data from, to test the globe.
    internet: [...request.matchAll(/\[net:([a-z0-9.-]+)\]/g)].map((m) => ({
      host: m[1],
      why: 'the rate of the day',
    })),
    // [lib:<package>] names a free library to carry, to test the registry check and the vendoring.
    libraries: [...request.matchAll(/\[lib:([a-z0-9@/._-]+)\]/g)].map((m) => ({
      name: m[1],
      why: 'to test',
    })),
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

/**
 * A research of a simulated simulator: what a real one records, through the same recording code,
 * without opening a browser. [ask-which] in the request makes it ask which feature first.
 */
async function research(req: AskRequest, emit: (e: AskEvent) => void) {
  const { record } = await import('../research/record.ts');
  const url = req.prompt.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? 'https://example.com/';
  const host = new URL(url).hostname;
  const answered = req.prompt.includes('The owner answered:');
  const step = async (e: AskEvent, kind?: Parameters<typeof record>[1], args?: object) => {
    emit(e);
    await sleep(STEP_MS / 2, req.signal);
    if (kind) await record(req.cwd!, kind, args as Record<string, unknown>);
  };
  await step({ type: 'tool', action: 'browse', target: host });
  // [searches:<n>] makes it search n times with long queries, to test a crowded sky.
  const searches = Number(req.prompt.match(/\[searches:(\d{1,2})\]/)?.[1] ?? 0);
  for (let i = 1; i <= searches; i++)
    await step({
      type: 'tool',
      action: 'search',
      target: `como funciona a categoria de despesas ${i} no aplicativo, com orçamento por mês`,
    });
  if (req.prompt.includes('[ask-which]') && !answered) {
    await step({ type: 'tool', action: 'record', target: 'question' }, 'question', {
      question: 'Which feature should I copy?',
      // One long, as a real research gives them: a sentence, not a word.
      options: ['Yield simulator', 'Comparator of investments side by side, with the yield of each one after taxes and fees'],
    });
    return 'Asked which feature.';
  }
  await step({ type: 'tool', action: 'record', target: 'feature' }, 'feature', {
    feature: 'Yield simulator',
    target: url,
    server: 'one call, the rate of the day',
    fields: [{ name: 'value', detail: 'number, at least 1' }],
    outputs: [{ name: 'net', detail: '2 decimals' }],
  });
  for (const [value, net] of [
    ['1000', '1106.50'],
    ['20', '22.13'],
  ])
    await step({ type: 'tool', action: 'record', target: 'case' }, 'case', {
      input: { value },
      output: { net },
      source: 'observed',
    });
  await step({ type: 'tool', action: 'search', target: 'yield simulator rules' });
  await step({ type: 'tool', action: 'browse', target: 'help.example.com' });
  await step({ type: 'tool', action: 'record', target: 'rule' }, 'rule', {
    text: 'The rate is 10.65% a year',
    source: 'https://help.example.com/rate',
  });
  await step({ type: 'tool', action: 'record', target: 'finding' }, 'finding', {
    kind: 'improvement',
    text: 'Compare with savings',
    source: 'https://forum.example.com/1',
  });
  await step({ type: 'tool', action: 'record', target: 'finding' }, 'finding', {
    kind: 'gap',
    text: 'The rate changes every day',
  });
  return 'Researched the yield simulator.';
}

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
        // The notes for the next change, with what was asked last.
        ['NOTAS.md', `Asked last: ${asked}
Title: index.html #asked
`],
      ];
  // A copy with an answer key: the computation and its check. [check-fail-once] gets it wrong
  // in the first round, to test the round back to the Builder.
  if (req.prompt.includes('window.cerebroCheck')) {
    const wrong = req.prompt.includes('[check-fail-once]') && !req.prompt.includes('check failed');
    files.push(
      ['calc.js', `const net = (value) => (value * ${wrong ? '1.1' : '1.1065'}).toFixed(2);\n`],
      ['checks.js', 'window.cerebroCheck = (input) => ({ net: net(Number(input.value)) });\n'],
      ['checks.json', '{ "scripts": ["calc.js", "checks.js"] }\n'],
    );
  }
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
      } else if (req.system?.startsWith(RESEARCH_TAG) && req.cwd)
        text = await research(req, (e) => onEvent?.(e));
      else if (req.system?.startsWith(BUILD_TAG) && req.cwd)
        text = await build(req, (e) => onEvent?.(e));
      else if (req.system?.startsWith(ANSWER_TAG)) {
        await sleep(STEP_MS, req.signal);
        // What it answers says what it read; [change] is a change in a question's clothes, and
        // [garbled] an answer that does not parse when the cheap model answers.
        const question = req.prompt.match(/The owner asks:\n([^\n]*)/)?.[1] ?? '';
        const name = req.prompt.match(/You are "([^"]+)"/)?.[1] ?? '';
        text =
          question.includes('[garbled]') && req.role === 'cheap'
            ? 'not json'
            : JSON.stringify({
                answer: `${name} answers (${req.role}): ${question}`,
                change: question.includes('[change]'),
              });
      }
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
