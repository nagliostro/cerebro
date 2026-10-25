import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { dataDir } from '@cerebro/dominus/data-dir';

// Small JSON files in the data folder that only the owner may read: the folder is created
// with mode 700 and each file with 600 (Windows ignores the modes; the folder already sits in
// the owner's profile). Writes go to a temporary file first and are renamed over the old one,
// so a crash never leaves half a file.

export const privatePath = (name: string) => path.join(dataDir(), name);

export async function readPrivateJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(privatePath(name), 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writePrivateJson(name: string, value: unknown): Promise<void> {
  const file = privatePath(name);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
  await rename(tmp, file);
}

export async function removePrivate(name: string): Promise<void> {
  await rm(privatePath(name), { force: true });
}

/** Last change of the file, to know when a cached copy is stale; 0 when it does not exist. */
export async function privateMtime(name: string): Promise<number> {
  try {
    return (await stat(privatePath(name))).mtimeMs;
  } catch {
    return 0;
  }
}
