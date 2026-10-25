import { spawn } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { researchEvent } from '../research/events.ts';
import type {
  AiProvider,
  AskEvent,
  AskRequest,
  AskResult,
  HealthCheck,
  QuotaWindow,
  ToolAction,
} from './types.ts';

// Claude Code adapter: the owner's own CLI and subscription, where they logged in themselves.
// Everything Claude-specific lives here: model aliases, flags, the stream-json format and the
// rate_limit_event.

const MODELS = { cheap: 'haiku', balanced: 'sonnet', strong: 'opus' } as const;
const WINDOWS: Record<string, QuotaWindow['name']> = { five_hour: 'session', seven_day: 'week' };

// Text mode: no tools, MCP servers, settings, skills or CLAUDE.md, in a folder of its own, so the
// CLI loads ~0.6k tokens of context instead of ~34k (E4). The quota event still arrives.
const TEXT_FLAGS = [
  '--tools',
  '',
  '--strict-mcp-config',
  '--setting-sources',
  '',
  '--disable-slash-commands',
];

// Files only (building a neuron): the file tools, edits accepted only inside the working folder
// (anything outside would need a person to approve, and there is none), no commands, no internet,
// and none of the owner's own settings, hooks or MCP servers.
const FILE_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep'];
const FILE_FLAGS = [
  '--tools',
  FILE_TOOLS.join(','),
  '--permission-mode',
  'acceptEdits',
  '--strict-mcp-config',
  '--setting-sources',
  '',
  '--disable-slash-commands',
];
// Research: none of the CLI's own tools (no files, commands or its web tools), only the Cerebro's
// research server, where every page goes through the guard. Anything else would need a person to
// approve, and with --permission-prompts none it is refused at once.
const RESEARCH_SERVER = path.join(import.meta.dirname, '..', 'research', 'mcp-server.ts');
const MCP_PREFIX = 'mcp__cerebro__';
function researchFlags(cwd: string, req: AskRequest): string[] {
  const env: Record<string, string> = {};
  // Only the tests set it (their own local pages); passed on so the server sees the same.
  if (process.env.CEREBRO_BROWSER_ALLOW)
    env.CEREBRO_BROWSER_ALLOW = process.env.CEREBRO_BROWSER_ALLOW;
  const config = {
    mcpServers: {
      cerebro: {
        type: 'stdio',
        command: process.execPath,
        args: [
          RESEARCH_SERVER,
          '--dir',
          path.resolve(cwd),
          '--locale',
          req.locale ?? 'en',
          '--max-pages',
          String(req.maxPages ?? 25),
        ],
        env,
      },
    },
  };
  return [
    '--tools',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    JSON.stringify(config),
    '--allowedTools',
    'mcp__cerebro',
    '--permission-prompts',
    'none',
    '--setting-sources',
    '',
    '--disable-slash-commands',
  ];
}

const ACTIONS: Record<string, ToolAction> = {
  Read: 'read',
  Write: 'write',
  Edit: 'write',
  MultiEdit: 'write',
  NotebookEdit: 'write',
  Glob: 'search',
  Grep: 'search',
};

/** A tool call → a generic action, with its file relative to the working folder. */
export function toolEvent(
  block: { name?: string; input?: { file_path?: unknown; path?: unknown } },
  cwd: string,
): AskEvent {
  if (block.name?.startsWith(MCP_PREFIX))
    return {
      type: 'tool',
      ...researchEvent(
        block.name.slice(MCP_PREFIX.length),
        (block.input ?? {}) as Record<string, unknown>,
      ),
    };
  const action = ACTIONS[block.name ?? ''] ?? 'other';
  const file = block.input?.file_path ?? block.input?.path;
  if (typeof file !== 'string') return { type: 'tool', action };
  // The folder as given and as it really is: the CLI may report either (on macOS the temporary
  // folder is a link, /var → /private/var).
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  for (const base of new Set([path.resolve(cwd), real(path.resolve(cwd))])) {
    const rel = path.relative(base, path.resolve(base, file)).split(path.sep).join('/');
    if (!rel.startsWith('..') && !path.isAbsolute(rel))
      return { type: 'tool', action, target: rel || '.' };
  }
  return { type: 'tool', action };
}

type Options = {
  /** The command and its first arguments; tests point it to a fake CLI. */
  bin?: string[];
  /** A fixed folder for text mode (not a new empty one each time), so sessions can continue. */
  textDir: string;
};

/** rate_limit_event → generic windows (utilization is 0..1, resetsAt in seconds). */
export function quotaFromEvent(event: {
  rate_limit_info?: {
    status?: string;
    rateLimitType?: string;
    utilization?: number;
    resetsAt?: number;
    unifiedWindows?: Record<string, { utilization?: number; resetsAt?: number }>;
  };
}): QuotaWindow[] {
  const info = event.rate_limit_info ?? {};
  const listed = { ...info.unifiedWindows };
  if (!Object.keys(listed).length && info.rateLimitType)
    listed[info.rateLimitType] = { utilization: info.utilization, resetsAt: info.resetsAt };
  return Object.entries(listed).flatMap(([key, w]) => {
    const name = WINDOWS[key];
    if (!name || typeof w?.utilization !== 'number') return [];
    return [
      {
        name,
        used: w.utilization,
        resetsAt: typeof w.resetsAt === 'number' ? new Date(w.resetsAt * 1000).toISOString() : null,
        source: 'official' as const,
        blocked: info.status === 'rejected' && info.rateLimitType === key,
      },
    ];
  });
}

export function claudeCode(opts: Options): AiProvider {
  const [cmd, ...pre] = opts.bin ?? [process.env.CEREBRO_CLAUDE_BIN ?? 'claude'];
  // No shell: the prompt goes through stdin, never the command line (no injection, no limit).
  const run = (args: string[], signal?: AbortSignal, cwd?: string) =>
    spawn(cmd!, [...pre, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      signal,
      cwd,
      windowsHide: true,
    });

  /** Runs a short command and returns its output, or null if it could not run or failed. */
  const output = (args: string[]) =>
    new Promise<string | null>((resolve) => {
      const p = run(args, AbortSignal.timeout(15_000));
      p.stdin.end();
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('error', () => resolve(null));
      p.on('exit', (code) => resolve(code === 0 ? out.trim() : null));
    });

  return {
    id: 'claude-code',
    name: 'Claude Code',
    capabilities: {
      billing: 'plan',
      modes: ['text', 'agent'],
      sessions: true,
      quotaSource: 'official',
      windows: [
        { name: 'session', lengthMs: 5 * 3600_000 },
        { name: 'week', lengthMs: 7 * 86_400_000 },
      ],
    },

    async check(): Promise<HealthCheck> {
      const version = await output(['--version']);
      if (version === null) return { ok: false, problem: 'not-installed', detail: 'claude' };
      const auth = await output(['auth', 'status']);
      try {
        if (auth && (JSON.parse(auth) as { loggedIn?: boolean }).loggedIn)
          return { ok: true, version: version.replace(/\s*\(Claude Code\)$/, '') };
      } catch {
        // Older CLIs print text here; treat as unknown and let the first ask tell.
      }
      return { ok: false, problem: 'not-logged-in', detail: 'claude' };
    },

    ask: (req, onEvent) =>
      new Promise<AskResult>((resolve, reject) => {
        const args = ['-p', '--model', MODELS[req.role], '--output-format', 'stream-json'];
        args.push('--verbose');
        const text = req.mode === 'text';
        if (text) args.push(...TEXT_FLAGS, '--system-prompt', req.system ?? 'Answer briefly.');
        else {
          if (req.access === 'files') args.push(...FILE_FLAGS);
          if (req.access === 'research' && req.cwd) args.push(...researchFlags(req.cwd, req));
          if (req.system) args.push('--append-system-prompt', req.system);
        }
        if (req.effort) args.push('--effort', req.effort);
        if (req.sessionId) args.push('--resume', req.sessionId);
        // An agent without its own folder would work wherever the core runs: never allowed.
        const cwd = text ? opts.textDir : req.cwd;
        if (!cwd) return reject(new Error('agent mode needs a working folder'));
        mkdirSync(path.resolve(cwd), { recursive: true });
        const p = run(args, req.signal, cwd);
        p.stdin.end(req.prompt);
        const emit = (e: AskEvent) => onEvent?.(e);
        let rest = '';
        let errors = '';
        let final: {
          is_error?: boolean;
          result?: string;
          usage?: Record<string, number>;
          total_cost_usd?: number;
          duration_ms?: number;
          session_id?: string;
        } | null = null;
        let model: string = MODELS[req.role];
        p.stderr.on('data', (d) => (errors = (errors + d).slice(-2000)));
        p.stdout.on('data', (chunk) => {
          const lines = (rest + chunk).split('\n');
          rest = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the CLI's own format
            let ev: any;
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            if (ev.type === 'system' && ev.subtype === 'init' && ev.model) model = ev.model;
            else if (ev.type === 'rate_limit_event')
              emit({ type: 'quota', windows: quotaFromEvent(ev) });
            else if (ev.type === 'assistant')
              for (const b of ev.message?.content ?? []) {
                if (b.type === 'text') emit({ type: 'text', text: b.text });
                if (b.type === 'tool_use') emit(toolEvent(b, cwd));
              }
            else if (ev.type === 'result') final = ev;
          }
        });
        p.on('error', reject);
        p.on('exit', (code) => {
          if (!final)
            return reject(new Error(`claude exited with ${code}: ${errors.trim() || 'no result'}`));
          if (final.is_error) return reject(new Error(String(final.result ?? 'claude error')));
          const u = final.usage ?? {};
          resolve({
            text: final.result ?? '',
            model,
            inputTokens:
              (u.input_tokens ?? 0) +
              (u.cache_read_input_tokens ?? 0) +
              (u.cache_creation_input_tokens ?? 0),
            outputTokens: u.output_tokens ?? 0,
            costUsd: final.total_cost_usd ?? null,
            durationMs: final.duration_ms ?? 0,
            sessionId: final.session_id,
          });
        });
      }),
  };
}
