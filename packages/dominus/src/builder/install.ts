import { cp, lstat, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

// A build writes into a draft folder of its own (builds/<plan>/). Only when it ends well, and its
// files pass the checks below, does the draft become the neuron's application
// (neurons/<id>/app/). A failed or canceled build leaves the neuron exactly as it was.

/** The kinds of file an application may have: the same the Cerebro serves (apps route). */
const SERVED = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.woff2',
]);
const MAX_FILES = 200;
const MAX_BYTES = 5 * 1024 * 1024;

export class BuildCheckError extends Error {}

export const draftDir = (dataDir: string, plan: string) => path.join(dataDir, 'builds', plan);
export const appDir = (dataDir: string, id: string) => path.join(dataDir, 'neurons', id, 'app');

/** A fresh draft; for an adjustment, a copy of the current application to change. */
export async function makeDraft(dataDir: string, plan: string, from?: string) {
  const dir = draftDir(dataDir, plan);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  if (from) await cp(appDir(dataDir, from), dir, { recursive: true }).catch(() => undefined);
  return dir;
}

/**
 * Checks a finished draft: an index.html, only files the Cerebro serves (anything else, such as
 * notes, is removed), no links, and within the limits. Returns what it holds.
 */
export async function checkDraft(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  async function walk(d: string) {
    for (const name of await readdir(d)) {
      const full = path.join(d, name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) await rm(full, { force: true });
      else if (info.isDirectory()) await walk(full);
      else if (!info.isFile() || !SERVED.has(path.extname(name).toLowerCase()))
        await rm(full, { force: true });
      else {
        files++;
        bytes += info.size;
      }
    }
  }
  await walk(dir);
  const index = await stat(path.join(dir, 'index.html')).catch(() => null);
  if (!index?.isFile()) throw new BuildCheckError('no index.html');
  if (files > MAX_FILES) throw new BuildCheckError(`too many files (${files})`);
  if (bytes > MAX_BYTES) throw new BuildCheckError(`too large (${bytes} bytes)`);
  return { files, bytes };
}

/** The draft becomes the application; an adjusted one keeps the previous version beside it. */
export async function install(dataDir: string, id: string, draft: string, adjusting: boolean) {
  const app = appDir(dataDir, id);
  await mkdir(path.dirname(app), { recursive: true });
  if (adjusting) {
    const previous = path.join(path.dirname(app), 'app.previous');
    await rm(previous, { recursive: true, force: true });
    await rename(app, previous).catch(() => undefined);
  } else await rm(app, { recursive: true, force: true });
  await rename(draft, app);
}

/** Takes an adjustment back: the previous application and the current one change places. */
export async function undo(dataDir: string, id: string) {
  const app = appDir(dataDir, id);
  const previous = path.join(path.dirname(app), 'app.previous');
  const swap = path.join(path.dirname(app), 'app.swap');
  if (!(await stat(path.join(previous, 'index.html')).catch(() => null)))
    throw new BuildCheckError('nothing to undo');
  await rm(swap, { recursive: true, force: true });
  await rename(app, swap);
  await rename(previous, app);
  await rename(swap, previous);
}

export const dropDraft = (dataDir: string, plan: string) =>
  rm(draftDir(dataDir, plan), { recursive: true, force: true });
