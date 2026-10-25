import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import { Parser, type ReadEntry } from 'tar';

// Free libraries a neuron may carry inside it, instead of code written from zero. "Known, trusted
// and used by the market" is checked, not guessed: the official npm registry says the license
// (only permissive ones, nothing that costs or binds the owner's code) and how much it is used;
// jsDelivr says which file runs in a browser. Building, the Cerebro downloads the package from the
// registry, checks its integrity hash and puts that file, with its license, in the neuron's folder:
// the application runs with no network, and nothing is paid.

const REGISTRY = 'https://registry.npmjs.org';
const DOWNLOADS = 'https://api.npmjs.org/downloads/point/last-week';
const FILES = 'https://data.jsdelivr.com/v1/packages/npm';

/** Weekly downloads below this are not "used by the market". */
export const MIN_WEEKLY = 10_000;
const MAX_BYTES = 3 * 1024 * 1024;
export const MAX_LIBRARIES = 5;

/** Licenses that let the owner use it freely, with no cost and no duty on their own code. */
const PERMISSIVE = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'Zlib',
  'Unlicense',
  'BlueOak-1.0.0',
  'CC0-1.0',
]);

export type Library = {
  name: string;
  version: string;
  license: string;
  weekly: number;
  /** The browser file inside the package, e.g. "dist/pdf-lib.min.js". */
  file: string;
  why: string;
};

export class LibraryError extends Error {}

const NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** "(MIT OR GPL-3.0)" is fine (MIT can be chosen); "MIT AND GPL-3.0" is not. */
export function permissive(license: string): boolean {
  const clean = license.replace(/[()]/g, ' ').trim();
  if (!clean) return false;
  return clean
    .split(/\s+OR\s+/i)
    .some((alt) => alt.split(/\s+AND\s+/i).every((l) => PERMISSIVE.has(l.trim())));
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new LibraryError(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

/** Is this package one a neuron may carry? What it is, or why not. */
export async function checkLibrary(name: unknown, why: unknown): Promise<Library> {
  const n = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!NAME.test(n) || n.length > 214) throw new LibraryError('not an npm package name');
  const meta = await json<{ version: string; license?: unknown; deprecated?: unknown }>(
    `${REGISTRY}/${n.replace('/', '%2F')}/latest`,
  ).catch(() => {
    throw new LibraryError(`${n} is not on the npm registry`);
  });
  if (meta.deprecated) throw new LibraryError(`${n} is deprecated`);
  const license = typeof meta.license === 'string' ? meta.license : '';
  if (!permissive(license))
    throw new LibraryError(`${n} has license "${license || 'none'}", not a permissive one`);
  const { downloads } = await json<{ downloads: number }>(`${DOWNLOADS}/${n}`).catch(() => ({
    downloads: 0,
  }));
  if (downloads < MIN_WEEKLY)
    throw new LibraryError(`${n} has ${downloads} downloads a week (at least ${MIN_WEEKLY})`);
  const files = await json<{ default?: string | null }>(`${FILES}/${n}@${meta.version}`).catch(
    () => ({ default: null }),
  );
  const file = (files.default ?? '').replace(/^\//, '');
  if (!/\.m?js$/.test(file)) throw new LibraryError(`${n} has no file that runs in a browser`);
  return {
    name: n,
    version: meta.version,
    license,
    weekly: downloads,
    file,
    why: typeof why === 'string' ? why.trim().replace(/\s+/g, ' ').slice(0, 200) : '',
  };
}

/** Where a library goes inside the application: vendor/<name>/<file name>. */
export const vendorPath = (lib: Library) =>
  `vendor/${lib.name.replace('/', '__')}/${path.posix.basename(lib.file)}`;

/**
 * Downloads the package from the registry, checks it against the hash the registry publishes,
 * and writes its browser file and its license into `dir` (the draft of the application).
 */
export async function vendorLibrary(dir: string, lib: Library): Promise<string> {
  const meta = await json<{ dist: { tarball: string; integrity: string } }>(
    `${REGISTRY}/${lib.name.replace('/', '%2F')}/${lib.version}`,
  );
  const [algo, digest] = meta.dist.integrity.split('-') as [string, string];
  if (algo !== 'sha512' || !digest) throw new LibraryError(`${lib.name}: no sha512 integrity`);
  const tarball = new URL(meta.dist.tarball);
  if (tarball.origin !== REGISTRY)
    throw new LibraryError(`${lib.name}: tarball outside the registry`);
  const res = await fetch(tarball, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new LibraryError(`${lib.name}: download answered ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  if (createHash('sha512').update(gz).digest('base64') !== digest)
    throw new LibraryError(`${lib.name}: the download does not match its integrity hash`);

  // Inside the tarball every file is under "package/".
  const wanted = `package/${lib.file}`;
  const found: Record<string, Buffer> = {};
  await new Promise<void>((resolve, reject) => {
    const parser = new Parser({
      onReadEntry: (entry: ReadEntry) => {
        const p = entry.path;
        const keep =
          p === wanted || /^package\/(LICEN[CS]E|COPYING)(\.(md|txt|markdown))?$/i.test(p);
        if (!keep || entry.size > MAX_BYTES) return entry.resume();
        const chunks: Buffer[] = [];
        entry.on('data', (c: Buffer) => chunks.push(c));
        entry.on('end', () => (found[p] = Buffer.concat(chunks)));
      },
    });
    parser.on('end', resolve);
    parser.on('error', reject);
    Readable.from(gz).pipe(parser);
  });
  const code = found[wanted];
  if (!code)
    throw new LibraryError(`${lib.name}: ${lib.file} is not in the package (or too large)`);
  const target = vendorPath(lib);
  await mkdir(path.join(dir, path.dirname(target)), { recursive: true });
  await writeFile(path.join(dir, target), code);
  const license = Object.entries(found).find(([p]) => p !== wanted)?.[1];
  await writeFile(
    path.join(dir, path.dirname(target), 'LICENSE.txt'),
    license ?? `${lib.name} ${lib.version} — ${lib.license}`,
  );
  return target;
}
