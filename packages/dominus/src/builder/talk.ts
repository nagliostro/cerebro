import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { nowMs } from '../clock.ts';
import { extractJson } from './plan.ts';
import { languageOf } from './prompts.ts';

// The conversation with a neuron: the owner asks, the neuron answers about itself. A change is a
// plan (as before); a question gets an answer: from its data by code when it asks how many (no
// AI), otherwise from a cheap model that reads the neuron's map, the code that matters and what
// was said lately. Telling a question from a change is code too: words, not a model.

export const ANSWER_TAG = 'cerebro-answer/1';
export const MAX_TALK = 2000;

export type TalkRow = {
  id: string;
  neuron: string;
  at: number;
  text: string;
  locale: string;
  /** direct: a model answered; noAi: code did (a count). */
  kind: 'direct' | 'noAi';
  reply: string | null;
  status: 'thinking' | 'done' | 'failed';
  job: string | null;
  tries: number;
  costUsd: number;
};

const COLUMNS = `id, neuron, at, text, locale, kind, reply, status, job, tries, cost AS costUsd`;

export class Talks {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 2000;
      CREATE TABLE IF NOT EXISTS talk (
        id TEXT PRIMARY KEY,
        neuron TEXT NOT NULL,
        at INTEGER NOT NULL,
        text TEXT NOT NULL,
        locale TEXT NOT NULL,
        kind TEXT NOT NULL,
        reply TEXT,
        status TEXT NOT NULL,
        job TEXT,
        tries INTEGER NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS talk_neuron ON talk (neuron, at);
    `);
  }

  close() {
    this.db.close();
  }

  create(row: Pick<TalkRow, 'neuron' | 'text' | 'locale' | 'kind' | 'reply' | 'status'>): TalkRow {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO talk (id, neuron, at, text, locale, kind, reply, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, row.neuron, nowMs(), row.text, row.locale, row.kind, row.reply, row.status);
    return this.get(id)!;
  }

  get(id: string): TalkRow | null {
    return (
      (this.db.prepare(`SELECT ${COLUMNS} FROM talk WHERE id = ?`).get(id) as
        | TalkRow
        | undefined) ?? null
    );
  }

  byJob(job: string): TalkRow | null {
    return (
      (this.db.prepare(`SELECT ${COLUMNS} FROM talk WHERE job = ?`).get(job) as
        | TalkRow
        | undefined) ?? null
    );
  }

  /** A neuron's conversation, oldest first (the latest `limit`). */
  list(neuron: string, limit = 50): TalkRow[] {
    return (
      this.db
        .prepare(`SELECT ${COLUMNS} FROM talk WHERE neuron = ? ORDER BY at DESC LIMIT ?`)
        .all(neuron, limit) as TalkRow[]
    ).reverse();
  }

  update(id: string, changes: Partial<Pick<TalkRow, 'reply' | 'status' | 'job' | 'tries'>> & {
    addCost?: number;
  }) {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [k, v] of Object.entries(changes)) {
      if (k === 'addCost') {
        sets.push('cost = cost + ?');
        values.push(v as number);
      } else {
        sets.push(`${k} = ?`);
        values.push(v as string | number | null);
      }
    }
    if (sets.length) this.db.prepare(`UPDATE talk SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  }

  /** The owner asked it to be taken as a change: it leaves the conversation for a plan. */
  remove(id: string) {
    this.db.prepare(`DELETE FROM talk WHERE id = ?`).run(id);
  }

  forget(neuron: string) {
    this.db.prepare(`DELETE FROM talk WHERE neuron = ?`).run(neuron);
  }
}

// ---- A question or a change: words, no AI. ----

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Starts as a question about how things are, whatever verbs follow ("como adiciono...?"). */
const ASKS =
  /^(o que|oque|que |como|onde|aonde|quando|quanto|quantos|quantas|qual|quais|por que|porque|pq |quem|de onde|pra que|para que|what|how|where|when|which|why|who|whose)\b/;
/** Starts as a request in a question's clothes ("pode mostrar...?", "can you add...?"). */
const REQUESTS =
  /^(pode|poderia|podes|consegue|conseguiria|da pra|da para|voce pode|vc pode|quero|queria|gostaria|preciso|can you|could you|would you|please|i want|i would like|i need)\b/;
/** A verb of change anywhere: the owner wants something different in the neuron. */
const CHANGES =
  /\b(mud|troc|adicion|acrescent|coloq|coloc|remov|retir|tire|tira|apag|cri[ae]|faca|faz|deix|mostr|exib|escond|ocult|aument|diminu|reduz|corrij|corrig|consert|ajust|inclu|exclu|renome|traduz|traduza|add|change|remove|delete|make|show|hide|put|create|fix|rename|translate|increase|decrease|move|replace|turn)\w*/;

/** A question about the neuron (answered), not a change to it (planned). Unsure: a change. */
export function isQuestion(text: string): boolean {
  const t = plain(text);
  if (REQUESTS.test(t)) return false;
  if (ASKS.test(t)) return true;
  return t.endsWith('?') && !CHANGES.test(t);
}

/**
 * "How many..." about its data, answered by code from the records it keeps: a collection named
 * (or its singular), or the records in general. Null when the question is not that.
 */
export function countAnswer(
  text: string,
  collections: { name: string; count: number }[],
  locale: string,
): string | null {
  const t = ` ${plain(text).replace(/[^a-z0-9]+/g, ' ')} `;
  if (!/ (quant[oa]s?|how many|how much) /.test(t) || !collections.length) return null;
  const stem = (w: string) => w.replace(/(oes|aes|ns|es|s)$/, '');
  const named = collections.filter((c) =>
    c.name
      .split(/[-_]/)
      .some((w) => w.length >= 3 && (t.includes(` ${w} `) || t.includes(` ${stem(w)}`))),
  );
  const general = / (registros?|itens|item|dados|records?|items?|entries|entradas?) /.test(t);
  const chosen = named.length ? named : general ? collections : [];
  if (!chosen.length) return null;
  const pt = locale.startsWith('pt');
  const one = (c: { name: string; count: number }) =>
    pt
      ? `${c.count} ${c.count === 1 ? 'registro' : 'registros'} em ${c.name}`
      : `${c.count} ${c.count === 1 ? 'record' : 'records'} in ${c.name}`;
  return pt
    ? `Tenho ${chosen.map(one).join(', ')}.`
    : `I have ${chosen.map(one).join(', ')}.`;
}

// ---- The answer, by a model. ----

export const ANSWER_SYSTEM = `${ANSWER_TAG}
You are a neuron of the Cerebro (a small application of its owner), answering the owner about
yourself. Speak in the first person, in the owner's language, plain and short: at most three
sentences, no code, no jargon. Use only what your map, your code and the conversation below say;
when they do not tell, say you do not know. You change nothing here. If the owner is asking for a
change to you rather than a question, set "change" to true and say in one short sentence that you
will plan it.

Answer with one JSON object and nothing else:
{ "answer": string, "change": boolean }`;

export function answerPrompt(input: {
  name: string;
  locale: string;
  map: string;
  code: { path: string; text: string; only?: string[] }[];
  partial: boolean;
  conversation: string[];
  question: string;
}): string {
  const lines = [
    `Language for the owner: ${languageOf(input.locale)}.`,
    `You are "${input.name}".`,
    '',
    'Your map:',
    input.map,
    input.partial ? 'Your code, only the parts that share words with the question:' : 'Your code:',
  ];
  for (const f of input.code)
    lines.push(`--- ${f.path}${f.only ? ` (only: ${f.only.join(', ')})` : ''}`, f.text, '');
  if (input.conversation.length) lines.push('Lately, with the owner:', ...input.conversation, '');
  lines.push('The owner asks:', input.question);
  return lines.join('\n');
}

/** The answer from the model; null when it does not parse (asked again, a step up). */
export function parseAnswer(text: string): { answer: string; change: boolean } | null {
  try {
    const raw = extractJson(text) as { answer?: unknown; change?: unknown };
    const answer = typeof raw?.answer === 'string' ? raw.answer.trim().slice(0, 1200) : '';
    if (!answer) return null;
    return { answer, change: raw.change === true };
  } catch {
    return null;
  }
}
