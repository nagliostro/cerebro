import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

// The file tools the Cerebro itself runs for an agent that has no tools of its own (an API
// model): list, read and write, and only inside the working folder. Paths are resolved for real,
// so neither ".." nor a link leads outside; nothing here runs a command or reaches the internet.

const MAX_FILE_BYTES = 512 * 1024;
const MAX_LISTED = 300;

export class FileToolError extends Error {}

/** The real path of `rel` inside `root`, refusing anything that would leave it. */
async function inside(root: string, rel: unknown): Promise<string> {
  if (typeof rel !== 'string' || !rel || rel.includes('\0')) throw new FileToolError('bad path');
  const base = await realpath(root);
  const wanted = path.resolve(base, rel);
  if (wanted !== base && !wanted.startsWith(base + path.sep))
    throw new FileToolError('outside the folder');
  // The nearest part that exists must also be really inside (a link could point out).
  let probe = wanted;
  for (;;) {
    try {
      const real = await realpath(probe);
      if (real !== base && !real.startsWith(base + path.sep))
        throw new FileToolError('outside the folder');
      break;
    } catch (e) {
      if (e instanceof FileToolError) throw e;
      probe = path.dirname(probe);
    }
  }
  return wanted;
}

const relative = (root: string, file: string) =>
  path.relative(root, file).split(path.sep).join('/');

export async function listFiles(root: string): Promise<string[]> {
  const base = await realpath(root);
  const out: string[] = [];
  async function walk(dir: string) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (out.length >= MAX_LISTED) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) out.push(relative(base, full));
    }
  }
  await walk(base);
  return out.sort();
}

export async function readText(root: string, rel: unknown): Promise<string> {
  const file = await inside(root, rel);
  const info = await lstat(file).catch(() => null);
  if (!info?.isFile()) throw new FileToolError('no such file');
  if (info.size > MAX_FILE_BYTES) throw new FileToolError('file too large');
  return readFile(file, 'utf8');
}

export async function writeText(root: string, rel: unknown, content: unknown): Promise<string> {
  if (typeof content !== 'string') throw new FileToolError('content must be text');
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new FileToolError('file too large');
  const file = await inside(root, rel);
  const info = await lstat(file).catch(() => null);
  if (info && !info.isFile()) throw new FileToolError('not a file');
  await mkdir(path.dirname(file), { recursive: true });
  await inside(root, rel); // the folders just made are inside too
  await writeFile(file, content);
  return relative(await realpath(root), file);
}

/** The tools as an API model sees them (OpenAI function format). */
export const FILE_TOOL_SPECS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List every file in the working folder.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file of the working folder.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative to the folder.' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or replace a text file of the working folder with this content.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
] as const;

/** Runs one tool call; the answer is always text, errors included, so the model can go on. */
export async function runFileTool(
  root: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ output: string; action: 'read' | 'write' | 'search' | 'other'; target?: string }> {
  try {
    if (name === 'list_files')
      return { output: (await listFiles(root)).join('\n') || '(empty)', action: 'search' };
    if (name === 'read_file')
      return { output: await readText(root, args.path), action: 'read', target: String(args.path) };
    if (name === 'write_file') {
      const target = await writeText(root, args.path, args.content);
      return { output: `wrote ${target}`, action: 'write', target };
    }
    return { output: `unknown tool ${name}`, action: 'other' };
  } catch (e) {
    return { output: `error: ${(e as Error).message}`, action: 'other' };
  }
}
