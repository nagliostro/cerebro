import { readFile } from 'node:fs/promises';
import path from 'node:path';

// The guide to copying a feature: the base that ships with the Cerebro (playbooks/, in this
// package) and what this install learned (in the data folder, never the owner's data), read
// together before each research.

const BASE = path.join(import.meta.dirname, '..', '..', 'playbooks', 'clone-feature.md');
export const lessonsFile = (dataDir: string) =>
  path.join(dataDir, 'playbooks', 'clone-feature.lessons.md');

/** One lesson per "- **When:**" item. */
const LESSON = /^- \*\*When:\*\*/gm;

export async function readGuide(dataDir: string): Promise<{ text: string; lessons: number }> {
  const base = await readFile(BASE, 'utf8');
  const learned = await readFile(lessonsFile(dataDir), 'utf8').catch(() => '');
  const lessons = learned.match(LESSON)?.length ?? 0;
  return {
    text: lessons ? `${base}\n\n## Lessons of this install\n\n${learned.trim()}` : base,
    lessons,
  };
}

/** The research folder of a plan: what it found and its screenshots. */
export const researchDir = (dataDir: string, plan: string) => path.join(dataDir, 'research', plan);
