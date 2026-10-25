import { readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

// The owner's options of the Cerebro (Settings → General), in the data folder. Few on purpose:
// each one changes something real.

export type Depth = 'shallow' | 'medium' | 'deep';
export type Settings = {
  /** How far a research goes: pages it may open (10, 25, 60). */
  depth: Depth;
};

export const DEPTH_PAGES: Record<Depth, number> = { shallow: 10, medium: 25, deep: 60 };
const DEFAULTS: Settings = { depth: 'medium' };

const file = (dir: string) => path.join(dir, 'settings.json');

export function readSettings(dir: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(file(dir), 'utf8')) as Partial<Settings>;
    return { depth: raw.depth && raw.depth in DEPTH_PAGES ? raw.depth : DEFAULTS.depth };
  } catch {
    return { ...DEFAULTS };
  }
}

export class SettingsError extends Error {}

/** Changes some options; unknown keys and bad values are refused. */
export async function writeSettings(dir: string, changes: Record<string, unknown>) {
  const next = readSettings(dir);
  for (const [k, v] of Object.entries(changes)) {
    if (k === 'depth' && typeof v === 'string' && v in DEPTH_PAGES) next.depth = v as Depth;
    else throw new SettingsError(`invalid ${k}`);
  }
  await writeFile(`${file(dir)}.tmp`, JSON.stringify(next, null, 2));
  await rename(`${file(dir)}.tmp`, file(dir));
  return next;
}
