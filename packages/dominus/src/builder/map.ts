// The map of a neuron (NEURONIO.md): what the Dominus needs to change it without reading all of
// its code. Two parts. What the code tells (its files and what each one has by name, its data,
// links, sites, libraries and latest requests) is made here at every look, so it is never stale.
// What only understanding tells (what it does, its screens, where each thing is, the owner's
// decisions, its limits) the Builder keeps in the application's notes (NOTAS.md), which go with
// the application: a draft copies them, Undo brings the previous ones back. No AI here.
//
// The same words choose the code the planner reads: a small neuron goes whole; a large one only
// in the parts that share words with the request (or that its notes point at for those words).

/** The Builder's notes, at the root of the application (the Cerebro never serves a .md). */
export const NOTES = 'NOTAS.md';
/** The map, beside the application. */
export const MAP = 'NEURONIO.md';

/** Code the planner may read: not the libraries the neuron carries, nor the notes. */
export const isOwnCode = (file: string) =>
  /\.(html|css|js|json)$/.test(file) && !file.startsWith('vendor/') && !/\.min\.js$/.test(file);

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const unique = (xs: string[]) => [...new Set(xs)];

/** What a file has, by name: functions, headings and ids, classes, keys. One line. */
export function outline(file: string, text: string): string {
  const names = (re: RegExp) => unique([...text.matchAll(re)].map((m) => m[1]!)).slice(0, 16);
  if (file.endsWith('.js')) {
    const fns = unique([
      ...names(/^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm),
      ...names(
        /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/gm,
      ),
    ]).slice(0, 16);
    const data = names(/cerebro\.data\(\s*['"]([\w-]+)['"]/g);
    const parts = [`functions ${fns.join(', ') || 'none'}`];
    if (data.length) parts.push(`data ${data.join(', ')}`);
    if (/cerebro\.net\.get/.test(text)) parts.push('reads the internet');
    return parts.join('; ');
  }
  if (file.endsWith('.html')) {
    const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    const heads = names(/<h[1-3][^>]*>([^<]{1,60})</gi).map((h) => `"${h.trim()}"`);
    const ids = names(/\sid="([\w-]+)"/g);
    return [
      title ? `title "${title}"` : '',
      heads.length ? `headings ${heads.join(', ')}` : '',
      ids.length ? `ids ${ids.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('; ');
  }
  if (file.endsWith('.css')) {
    const own = names(/\.((?!cb-)[a-z][\w-]*)\s*[{,:]/g);
    return own.length ? `classes ${own.join(', ')}` : '';
  }
  if (file.endsWith('.json'))
    try {
      return `keys ${Object.keys(JSON.parse(text)).slice(0, 12).join(', ')}`;
    } catch {
      return '';
    }
  return '';
}

export type MapInput = {
  id: string;
  name: string;
  role: string;
  files: { path: string; bytes: number; outline: string }[];
  collections: { name: string; fields: string[]; count: number }[];
  reads: string[];
  readBy: string[];
  sites: { host: string; why: string }[];
  libraries: string[];
  requests: { at: number; kind: string; request: string; ok: boolean }[];
  notes: string;
  /** The most the notes may take, in characters. */
  maxNotes: number;
};

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const day = (at: number) => new Date(at).toISOString().slice(0, 10);

/** The map, as Markdown. */
export function renderMap(m: MapInput): string {
  const lines = [`# ${m.name} (${m.id})`, '', `Role: ${m.role}.`, '', '## Files'];
  for (const f of m.files)
    lines.push(`- ${f.path} (${kb(f.bytes)})${f.outline ? `: ${clip(f.outline, 300)}` : ''}`);
  if (!m.files.length) lines.push('- (no application yet)');
  lines.push('', '## Data');
  for (const c of m.collections)
    lines.push(`- ${c.name}: ${c.fields.join(', ') || '(no fields yet)'} (${c.count} records)`);
  if (!m.collections.length) lines.push('- (none)');
  if (m.reads.length || m.readBy.length) {
    lines.push('', '## Links');
    if (m.reads.length) lines.push(`- reads: ${m.reads.join(', ')}`);
    if (m.readBy.length) lines.push(`- read by: ${m.readBy.join(', ')}`);
  }
  if (m.sites.length) {
    lines.push('', '## Internet (allowed)');
    for (const s of m.sites) lines.push(`- ${s.host}: ${s.why}`);
  }
  if (m.libraries.length) lines.push('', '## Libraries', ...m.libraries.map((l) => `- ${l}`));
  if (m.requests.length) {
    lines.push('', '## Latest requests');
    for (const r of m.requests)
      lines.push(`- ${day(r.at)} ${r.kind}${r.ok ? '' : ' (failed)'}: ${clip(r.request, 160)}`);
  }
  lines.push('', '## Notes');
  lines.push(m.notes.trim() ? clip(m.notes.trim(), m.maxNotes) : '(none yet)');
  return `${lines.join('\n')}\n`;
}

// ---- Choosing the code the planner reads. ----

const STOP = new Set(
  `the and for with that this from into have will when what make more less add show change
  uma umas uns que com para por como mais menos deve fazer coloque mude mudar trocar quero pode
  esse essa isso este esta isto seja ser ter tem dos das nos nas pelo pela muito tudo cada
  sobre entre depois antes ainda tambem tela neuronio neuron app aplicacao`.split(/\s+/),
);

/** The words of a text, as they are compared: no accents, lower case, camelCase split. */
export function words(text: string): Set<string> {
  const plain = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return new Set(plain.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)));
}

/** A file in parts, each by the name it starts with: a function, a rule, a section. */
export function parts(file: string, text: string): { name: string; text: string }[] {
  const start = file.endsWith('.js')
    ? /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/
    : file.endsWith('.html')
      ? /^\s{0,4}<(section|header|main|form|dialog|footer|nav|template|script|style)\b[^>]*?(?:id="([\w-]+)")?/
      : null;
  if (!start) return [{ name: file, text }];
  const out: { name: string; text: string }[] = [];
  let current = { name: '(top)', lines: [] as string[] };
  for (const line of text.split('\n')) {
    const m = line.match(start);
    if (m && current.lines.some((l) => l.trim())) {
      out.push({ name: current.name, text: current.lines.join('\n') });
      current = { name: m[2] ?? m[1]!, lines: [] };
    } else if (m) current.name = m[2] ?? m[1]!;
    current.lines.push(line);
  }
  out.push({ name: current.name, text: current.lines.join('\n') });
  return out;
}

/**
 * The code for the planner, within `budget` characters. All of it when it fits (a small neuron;
 * the same text every round keeps the cache). Otherwise the parts that share the most words with
 * the request, or with the notes' lines that do; parts that share none are left to the map.
 */
export function chooseCode(
  files: { path: string; text: string }[],
  said: string,
  notes: string,
  budget: number,
): { code: { path: string; text: string; only?: string[] }[]; partial: boolean } {
  const own = files.filter((f) => isOwnCode(f.path));
  if (own.reduce((n, f) => n + f.text.length, 0) <= budget) return { code: own, partial: false };
  const wanted = words(said);
  // A line of the notes that shares a word with the request lends its names to the search
  // ("Save button: app.js save()" makes "save" a wanted word for "o botão de salvar").
  for (const line of notes.split('\n')) {
    const w = words(line);
    if ([...w].some((x) => wanted.has(x))) for (const x of w) wanted.add(x);
  }
  const scored = own.flatMap((f, fi) =>
    parts(f.path, f.text).map((p, pi) => {
      const inText = words(p.text);
      const inName = words(p.name);
      let score = 0;
      for (const w of wanted) score += (inName.has(w) ? 3 : 0) + (inText.has(w) ? 1 : 0);
      return { path: f.path, name: p.name, text: p.text, score, order: fi * 10_000 + pi };
    }),
  );
  const picked: typeof scored = [];
  let size = 0;
  for (const p of [...scored].filter((p) => p.score > 0).sort((a, b) => b.score - a.score)) {
    if (size + p.text.length > budget) continue;
    picked.push(p);
    size += p.text.length;
  }
  // Nothing in common (the request in other words than the code): the start of each file.
  if (!picked.length)
    for (const p of scored) {
      if (size + p.text.length > budget) break;
      picked.push(p);
      size += p.text.length;
    }
  picked.sort((a, b) => a.order - b.order);
  const byFile = new Map<string, { names: string[]; texts: string[] }>();
  for (const p of picked) {
    const f = byFile.get(p.path) ?? { names: [], texts: [] };
    f.names.push(p.name);
    f.texts.push(p.text);
    byFile.set(p.path, f);
  }
  return {
    code: [...byFile].map(([path, f]) => ({ path, text: f.texts.join('\n…\n'), only: f.names })),
    partial: true,
  };
}
