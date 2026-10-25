import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  question: null,
  screenshot: null,
  sites: [],
});

export const LIMITS = { cases: 40, rules: 20, findings: 10, fields: 24 };

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

export type RecordKind = 'feature' | 'case' | 'rule' | 'finding' | 'library' | 'question';

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
      output: flat(args.output, 'output'),
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
  return 'saved';
}
