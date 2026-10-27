import type { ToolAction } from '../providers/types.ts';
import type { RecordKind } from './record.ts';

// Which step of the screen each research tool call is. Its own small module: the adapters use it
// without loading the browser.

export const RECORDS: Record<string, RecordKind> = {
  set_feature: 'feature',
  add_case: 'case',
  add_rule: 'rule',
  add_finding: 'finding',
  add_library: 'library',
  add_source: 'source',
  set_screen: 'screen',
  ask_owner: 'question',
};

const hostOf = (url: unknown) => {
  try {
    return new URL(String(url)).hostname;
  } catch {
    return undefined;
  }
};

/** A research tool call → the step the screen shows (also for calls another CLI ran). */
export function researchEvent(
  name: string,
  args: Record<string, unknown>,
): { action: ToolAction; target?: string } {
  if (RECORDS[name]) return { action: 'record', target: RECORDS[name] };
  if (name === 'open') return { action: 'browse', target: hostOf(args.url) };
  if (name === 'search') return { action: 'search', target: String(args.query ?? '').slice(0, 80) };
  if (name === 'screenshot') return { action: 'record', target: 'screenshot' };
  if (name === 'attachment')
    return { action: 'read', target: String(args.name ?? '').slice(0, 60) };
  if (name === 'click' || name === 'type' || name === 'select') return { action: 'browse' };
  if (name === 'snapshot' || name === 'read' || name === 'network') return { action: 'read' };
  return { action: 'other' };
}
