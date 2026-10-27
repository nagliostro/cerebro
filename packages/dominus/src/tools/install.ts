import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

import { Parser, type ReadEntry } from 'tar';

import { netDownload } from '../browser/fetch.ts';
import { MAX_DOWNLOAD, RELEASE_HOSTS, ToolError, type Format } from './release.ts';

// Installing an accepted program, in a worker (no AI, costs nothing): the pinned file downloaded
// through the guard, its SHA-256 checked against the plan's, unpacked inside the draft with no
// path leaving it and no links, and run once with --version (or --help) to see that it works.
// Anything wrong ends it before the neuron exists; the draft is thrown away.

/** Unpacked, a program may take this much. */
const MAX_UNPACKED = 600 * 1024 * 1024;
const MAX_FILES = 5000;
const SMOKE_MS = 10_000;

export type ToolJob = {
  /** The draft folder; the program goes into its tool/ folder. */
  dir: string;
  url: string;
  sha256: string;
  bytes: number;
  format: Format;
  /** The file's name, and words its program's name likely has (the repository's name). */
  asset: string;
  hints: string[];
};

export type ToolInstalled = {
  program: string;
  version: string | null;
  smoke: 'version' | 'help';
  files: number;
  bytes: number;
};

const RELEASE_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\/[^?#]+$/;

export function isToolJob(p: unknown): p is ToolJob {
  const j = p as ToolJob;
  return (
    typeof j?.dir === 'string' &&
    typeof j.url === 'string' &&
    RELEASE_URL.test(j.url) &&
    typeof j.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(j.sha256) &&
    Number.isInteger(j.bytes) &&
    j.bytes > 0 &&
    j.bytes <= MAX_DOWNLOAD &&
    ['zip', 'tar.gz', 'exe', 'binary'].includes(j.format) &&
    typeof j.asset === 'string' &&
    /^[\w.+-]{1,120}$/.test(j.asset) &&
    Array.isArray(j.hints) &&
    j.hints.every((h) => typeof h === 'string')
  );
}

/** Where an archive's entry goes inside `root`, or null when it would leave it. */
export function inside(root: string, name: string): string | null {
  const clean = name.replace(/\\/g, '/');
  if (clean.startsWith('/') || /^[a-z]:/i.test(clean)) return null;
  const parts = clean.split('/').filter((p) => p && p !== '.');
  if (!parts.length || parts.some((p) => p === '..')) return null;
  const full = path.join(root, ...parts);
  return full.startsWith(root + path.sep) ? full : null;
}

/** Counts what is unpacked, and stops at the limits (an archive that grows without end). */
class Tally {
  files = 0;
  bytes = 0;
  add(bytes: number) {
    this.files++;
    this.bytes += bytes;
    if (this.files > MAX_FILES || this.bytes > MAX_UNPACKED) throw new ToolError('tool-too-large');
  }
}

async function place(root: string, name: string, data: Buffer, exec: boolean, tally: Tally) {
  const file = inside(root, name);
  if (!file) throw new ToolError('tool-bad-archive');
  tally.add(data.length);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  if (exec && process.platform !== 'win32') await chmod(file, 0o755);
}

/** A zip, read from its central directory. Stored and deflated entries; links are skipped. */
export async function unzip(zip: Buffer, root: string, tally = new Tally()) {
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--)
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new ToolError('tool-bad-archive');
  const count = zip.readUInt16LE(end + 10);
  let p = zip.readUInt32LE(end + 16);
  if (count === 0xffff || p === 0xffffffff) throw new ToolError('tool-bad-archive');
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new ToolError('tool-bad-archive');
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const packed = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLength = zip.readUInt16LE(p + 28);
    const rest = zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    const mode = zip.readUInt32LE(p + 38) >>> 16;
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLength);
    p += 46 + nameLength + rest;
    // Folders are made as their files come; links never come out of an archive.
    if (name.endsWith('/') || (mode & 0o170000) === 0o120000) continue;
    if (flags & 1) throw new ToolError('tool-bad-archive');
    if (size > MAX_UNPACKED) throw new ToolError('tool-too-large');
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + packed);
    let data: Buffer;
    try {
      data =
        method === 0 ? raw : method === 8 ? inflateRawSync(raw, { maxOutputLength: size }) : null!;
    } catch {
      throw new ToolError('tool-bad-archive');
    }
    if (!data || data.length !== size) throw new ToolError('tool-bad-archive');
    await place(root, name, data, (mode & 0o111) !== 0, tally);
  }
  return tally;
}

/** A .tar.gz, entry by entry: files only (no links, devices or anything that leaves the folder). */
export async function untar(file: string, root: string, tally = new Tally()) {
  const writes: Promise<void>[] = [];
  await new Promise<void>((resolve, reject) => {
    const parser = new Parser({
      onReadEntry: (entry: ReadEntry) => {
        if (entry.type !== 'File' && entry.type !== 'OldFile') return entry.resume();
        if ((entry.size ?? 0) > MAX_UNPACKED) {
          parser.abort(new ToolError('tool-too-large'));
          return entry.resume();
        }
        const chunks: Buffer[] = [];
        entry.on('data', (c: Buffer) => chunks.push(c));
        entry.on('end', () =>
          writes.push(
            place(
              root,
              entry.path,
              Buffer.concat(chunks),
              ((entry.mode ?? 0) & 0o111) !== 0,
              tally,
            ),
          ),
        );
      },
    });
    parser.on('end', resolve);
    parser.on('abort', reject);
    parser.on('error', reject);
    createReadStream(file).on('error', reject).pipe(parser);
  });
  // The first entry that failed (one leaving the folder, the limits) fails the whole.
  for (const r of await Promise.allSettled(writes))
    if (r.status === 'rejected')
      throw r.reason instanceof ToolError ? r.reason : new ToolError('tool-bad-archive');
  return tally;
}

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const info = await lstat(full);
    if (info.isDirectory()) out.push(...(await walk(full, base)));
    else if (info.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** The program among the unpacked files: by its name, or the only one there is. */
export async function findProgram(root: string, hints: string[]): Promise<string | null> {
  const files = await walk(root);
  const windows = process.platform === 'win32';
  const programs: string[] = [];
  for (const f of files) {
    if (windows) {
      if (/\.exe$/i.test(f)) programs.push(f);
    } else if (!/\.[a-z0-9]{1,5}$/i.test(path.posix.basename(f))) {
      const mode = (await lstat(path.join(root, f))).mode;
      if (mode & 0o111) programs.push(f);
    }
  }
  const base = (f: string) =>
    path.posix
      .basename(f)
      .replace(/\.exe$/i, '')
      .toLowerCase();
  const wanted = hints.map((h) => h.toLowerCase());
  const named = programs
    .filter((f) => wanted.includes(base(f)))
    .sort((a, b) => a.split('/').length - b.split('/').length);
  if (named[0]) return named[0];
  return programs.length === 1 ? programs[0]! : null;
}

/** Runs the program once, with nothing of the owner's: a small environment, a time limit. */
function run(program: string, args: string[]) {
  const env: Record<string, string> = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'LANG'])
    if (process.env[k]) env[k] = process.env[k]!;
  return new Promise<{ exit0: boolean; ran: boolean; out: string }>((resolve) => {
    execFile(
      program,
      args,
      {
        cwd: path.dirname(program),
        env,
        timeout: SMOKE_MS,
        windowsHide: true,
        maxBuffer: 256 * 1024,
      },
      (error, stdout, stderr) => {
        const out = `${stdout}\n${stderr}`.trim();
        const timedOut = !!error && (error as { killed?: boolean }).killed === true;
        // It ran when it answered in words within the time, whatever its exit code.
        resolve({ exit0: !error && !!out, ran: !timedOut && !!out, out });
      },
    );
  });
}

/** The smoke test: --version first, then --help. */
export async function smoke(program: string) {
  const v = await run(program, ['--version']);
  if (v.exit0)
    return { smoke: 'version' as const, version: v.out.split('\n')[0]!.trim().slice(0, 120) };
  const h = await run(program, ['--help']);
  // Many programs print their help and exit with a code: it still ran on this computer.
  if (h.ran || v.ran) return { smoke: 'help' as const, version: null };
  throw new ToolError('tool-smoke-failed');
}

const download = (url: string, file: string, max: number) =>
  netDownload(url, (h) => RELEASE_HOSTS.has(h), file, max);

/** The whole installation, into `job.dir`/tool; a test gives its own download and test. */
export async function installTool(
  job: ToolJob,
  deps = { download, smoke },
): Promise<ToolInstalled> {
  const root = path.join(job.dir, 'tool');
  const file = path.join(job.dir, 'download.part');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  try {
    const got = await deps.download(job.url, file, job.bytes);
    if (got.sha256 !== job.sha256 || got.bytes !== job.bytes)
      throw new ToolError('tool-checksum-mismatch');
    let tally: Tally;
    if (job.format === 'zip') tally = await unzip(await readFile(file), root);
    else if (job.format === 'tar.gz') tally = await untar(file, root);
    else {
      tally = new Tally();
      tally.add(got.bytes);
      await copyFile(file, path.join(root, job.asset));
      if (job.format === 'binary') await chmod(path.join(root, job.asset), 0o755);
    }
    const asset = job.asset.replace(/\.(zip|tar\.gz|tgz|exe)$/i, '');
    const program = await findProgram(root, [
      ...job.hints,
      job.format === 'exe' || job.format === 'binary' ? asset : '',
      asset.split(/[-_.]/)[0]!,
    ]);
    if (!program) throw new ToolError('tool-no-program');
    const test = await deps.smoke(path.join(root, program));
    return { program, ...test, files: tally.files, bytes: tally.bytes };
  } finally {
    await rm(file, { force: true });
  }
}
