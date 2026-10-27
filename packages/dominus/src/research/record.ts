import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { netGet } from '../browser/fetch.ts';
import { checkLibrary, LibraryError, MAX_LIBRARIES, type Library } from './libraries.ts';

// What a research finds, written by the AI one piece at a time through tools (never as free
// text), each piece checked and trimmed here. The plan shows it; the answer key goes with the
// neuron and checks every build. The file lives in the research folder.

export const RESEARCH_FILE = 'research.json';

export type Detail = { name: string; detail: string };
export type Case = {
  input: Record<string, string>;
  output: Record<string, string>;
  source: string;
};
export type Sourced = { text: string; source: string };

/**
 * Live data the feature shows (rates, prices, the weather): where the original gets it, and the
 * free public site the neuron will read instead, proven by the Cerebro opening its example.
 */
export type DataSource = {
  /** What it gives, e.g. "exchange rates and their history". */
  data: string;
  /** Where the original gets it, and whether that is paid. */
  original: string;
  host: string;
  /** A link that answered when the research recorded it. */
  example: string;
  /** How fresh it is, e.g. "once a day, about 16:00 CET". */
  updates: string;
  /** How to ask for a period, when it has history. */
  history: string;
};

/** One element of the original's screen, top to bottom (what the Interface lays out). */
export type ScreenItem = { kind: (typeof SCREEN_KINDS)[number]; text: string; detail: string };
export const SCREEN_KINDS = [
  'headline',
  'number',
  'text',
  'field',
  'choice',
  'pair',
  'swap',
  'button',
  'tabs',
  'chart',
  'list',
  'source',
] as const;

export type Research = {
  /** The feature being copied, in the owner's words. */
  feature: string;
  /** Where it comes from: a link or a path. */
  target: string;
  fields: Detail[];
  outputs: Detail[];
  /** What the server does, if anything (the calls seen). */
  server: string;
  cases: Case[];
  rules: Sourced[];
  improvements: Sourced[];
  defects: Sourced[];
  gaps: string[];
  /** Free libraries that do the hard part, checked on the npm registry. */
  libraries: Library[];
  /** Where its live data comes from, each free site checked by the Cerebro. */
  sources: DataSource[];
  /** The original's screen, top to bottom. */
  screen: ScreenItem[];
  /** The research stopped to ask the owner (which feature, where from). */
  question: { text: string; options: string[] } | null;
  /** The main screenshot, a file in the research folder. */
  screenshot: string | null;
  /** Filled by the Cerebro from the guard proxy, never by the AI. */
  sites: { host: string; pages: number }[];
};

export const emptyResearch = (): Research => ({
  feature: '',
  target: '',
  fields: [],
  outputs: [],
  server: '',
  cases: [],
  rules: [],
  improvements: [],
  defects: [],
  gaps: [],
  libraries: [],
  sources: [],
  screen: [],
  question: null,
  screenshot: null,
  sites: [],
});

export const LIMITS = { cases: 40, rules: 20, findings: 10, fields: 24, sources: 3, screen: 16 };

export class RecordError extends Error {}

const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';

/** A source is a public link or "observed" (seen on the original itself). */
function source(v: unknown): string {
  const s = text(v, 300);
  if (s === 'observed') return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch {
    // Below.
  }
  throw new RecordError('source must be a link (https://...) or "observed"');
}

function flat(v: unknown, what: string): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new RecordError(`${what} must be an object`);
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v).slice(0, 16)) {
    const key = text(k, 40);
    const value = typeof x === 'number' || typeof x === 'boolean' ? String(x) : text(x, 200);
    if (key && value) out[key] = value;
  }
  if (!Object.keys(out).length) throw new RecordError(`${what} is empty`);
  return out;
}

/** An output is a value as the original shows it, never a note about it. */
function values(out: Record<string, string>) {
  for (const [k, v] of Object.entries(out))
    if (v.split(' ').length > 8)
      throw new RecordError(
        `output "${k}" reads like a note; record only the value the original shows (notes go in add_rule or add_finding)`,
      );
  return out;
}

/** Opens the example through the same guarded path the application will use. */
async function provenSource(args: Record<string, unknown>): Promise<DataSource> {
  const example = text(args.example, 300);
  let host: string;
  try {
    const u = new URL(example);
    if (u.protocol !== 'https:') throw new Error();
    host = u.hostname.toLowerCase();
  } catch {
    throw new RecordError('example must be an https:// link that gives the data');
  }
  let answer;
  try {
    answer = await netGet(example, (h) => h === host);
  } catch (e) {
    throw new RecordError(
      `the example did not answer (${(e as Error).message}); try another source`,
    );
  }
  if (answer.status !== 200)
    throw new RecordError(`the example answered ${answer.status}; try another link or source`);
  if (/captcha|sign in|api[ _-]?key/i.test(answer.body.slice(0, 2000)) && !/json/.test(answer.type))
    throw new RecordError('the example asks for a key or a login; find a free source with no key');
  return {
    data: text(args.data, 120),
    original: text(args.original, 200),
    host,
    example,
    updates: text(args.updates, 120),
    history: text(args.history, 200),
  };
}

const screenItems = (v: unknown): ScreenItem[] =>
  (Array.isArray(v) ? v : [])
    .map((x: { kind?: unknown; text?: unknown; detail?: unknown }) => ({
      kind: (SCREEN_KINDS as readonly unknown[]).includes(x?.kind)
        ? (x.kind as ScreenItem['kind'])
        : 'text',
      text: text(x?.text, 120),
      detail: text(x?.detail, 200),
    }))
    .filter((x) => x.text || x.detail)
    .slice(0, LIMITS.screen);

const details = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .map((d: { name?: unknown; detail?: unknown }) => ({
      name: text(d?.name, 60),
      detail: text(d?.detail, 200),
    }))
    .filter((d) => d.name)
    .slice(0, LIMITS.fields);

export async function readResearch(dir: string): Promise<Research> {
  try {
    return {
      ...emptyResearch(),
      ...JSON.parse(await readFile(path.join(dir, RESEARCH_FILE), 'utf8')),
    };
  } catch {
    return emptyResearch();
  }
}

/** Writes whole (a new file, then renamed), so a reader never sees half of it. */
export async function writeResearch(dir: string, r: Research) {
  const file = path.join(dir, RESEARCH_FILE);
  await writeFile(`${file}.tmp`, JSON.stringify(r, null, 2));
  await rename(`${file}.tmp`, file);
}

export type RecordKind =
  'feature' | 'case' | 'rule' | 'finding' | 'library' | 'source' | 'screen' | 'question';

/** One recording tool call; returns what to tell the AI. */
export async function record(
  dir: string,
  kind: RecordKind,
  args: Record<string, unknown>,
): Promise<string> {
  const r = await readResearch(dir);
  if (kind === 'feature') {
    r.feature = text(args.feature, 200) || r.feature;
    r.target = text(args.target, 300) || r.target;
    r.server = text(args.server, 400) || r.server;
    const fields = details(args.fields);
    const outputs = details(args.outputs);
    if (fields.length) r.fields = fields;
    if (outputs.length) r.outputs = outputs;
    if (!r.feature) throw new RecordError('feature is required');
  } else if (kind === 'case') {
    if (r.cases.length >= LIMITS.cases) throw new RecordError(`at most ${LIMITS.cases} cases`);
    const c = {
      input: flat(args.input, 'input'),
      output: values(flat(args.output, 'output')),
      source: source(args.source),
    };
    const key = JSON.stringify(c.input);
    if (r.cases.some((x) => JSON.stringify(x.input) === key))
      throw new RecordError('this input is already a case');
    r.cases.push(c);
  } else if (kind === 'rule') {
    if (r.rules.length >= LIMITS.rules) throw new RecordError(`at most ${LIMITS.rules} rules`);
    const t = text(args.text, 300);
    if (!t) throw new RecordError('text is required');
    r.rules.push({ text: t, source: source(args.source) });
  } else if (kind === 'finding') {
    const t = text(args.text, 300);
    if (!t) throw new RecordError('text is required');
    if (args.kind === 'gap') {
      if (r.gaps.length >= LIMITS.findings) throw new RecordError('too many gaps');
      r.gaps.push(t);
    } else {
      const list =
        args.kind === 'defect' ? r.defects : args.kind === 'improvement' ? r.improvements : null;
      if (!list) throw new RecordError('kind must be improvement, defect or gap');
      if (list.length >= LIMITS.findings) throw new RecordError('too many of this kind');
      list.push({ text: t, source: source(args.source) });
    }
  } else if (kind === 'library') {
    if (r.libraries.length >= MAX_LIBRARIES)
      throw new RecordError(`at most ${MAX_LIBRARIES} libraries`);
    let lib: Library;
    try {
      lib = await checkLibrary(args.name, args.why);
    } catch (e) {
      // Why it was refused goes back to the AI, so it can look for another one.
      if (e instanceof LibraryError) throw new RecordError(e.message);
      throw e;
    }
    if (r.libraries.some((l) => l.name === lib.name)) throw new RecordError('already recorded');
    r.libraries.push(lib);
  } else if (kind === 'source') {
    if (r.sources.length >= LIMITS.sources)
      throw new RecordError(`at most ${LIMITS.sources} sources`);
    const s = await provenSource(args);
    r.sources = [...r.sources.filter((x) => x.host !== s.host), s];
  } else if (kind === 'screen') {
    const items = screenItems(args.items);
    if (!items.length) throw new RecordError('items is empty');
    r.screen = items;
  } else {
    const q = text(args.question, 300);
    const options = (Array.isArray(args.options) ? args.options : [])
      .map((o) => text(o, 60))
      .filter(Boolean)
      .slice(0, 6);
    if (!q) throw new RecordError('question is required');
    r.question = { text: q, options };
  }
  await writeResearch(dir, r);
  if (kind === 'case') return `case ${r.cases.length} saved`;
  if (kind === 'library') {
    const l = r.libraries.at(-1)!;
    return `library saved: ${l.name} ${l.version} (${l.license}, ${l.weekly} downloads a week), file ${l.file}`;
  }
  if (kind === 'question') return 'question saved: stop now, the owner will answer';
  if (kind === 'source')
    return `source saved: ${r.sources.at(-1)!.host} answered; the neuron will read it through the Cerebro`;
  return 'saved';
}
