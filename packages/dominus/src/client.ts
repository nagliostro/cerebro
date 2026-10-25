import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';

import { corePaths, type CorePaths } from './paths.ts';

// How the screens talk to the core: HTTP over the core's pipe or socket, with the token from the
// data folder. Also starts the core when it is not running.

export class CoreUnavailable extends Error {}

export async function coreRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  paths: CorePaths = corePaths(),
): Promise<T> {
  let token: string;
  try {
    token = (await readFile(paths.token, 'utf8')).trim();
  } catch {
    throw new CoreUnavailable('the core never started');
  }
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: paths.socket,
        path,
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        timeout: 30_000,
      },
      (res) => {
        let s = '';
        res.on('data', (d) => (s += d));
        res.on('end', () => {
          const data = s ? JSON.parse(s) : null;
          if (res.statusCode && res.statusCode < 300) resolve(data as T);
          else reject(new Error(`core answered ${res.statusCode}: ${data?.error ?? s}`));
        });
      },
    );
    req.on('timeout', () => req.destroy(new CoreUnavailable('the core did not answer')));
    req.on('error', (e) =>
      reject(e instanceof CoreUnavailable ? e : new CoreUnavailable(e.message)),
    );
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

export const isCoreUp = (paths: CorePaths = corePaths()) =>
  coreRequest('GET', '/stats', undefined, paths).then(
    () => true,
    () => false,
  );

/**
 * Starts the core if it is not running and waits until it answers. It is a process of its own:
 * a crash of the screens never takes it down, and the next start finds it running. Its output
 * goes to the same terminal; Ctrl+C there stops both.
 */
export async function ensureCore(coreFile: string, waitMs = 10_000): Promise<boolean> {
  if (await isCoreUp()) return true;
  const child = spawn(process.execPath, [coreFile], { stdio: 'inherit', windowsHide: true });
  child.unref();
  const until = performance.now() + waitMs;
  while (performance.now() < until) {
    await new Promise((r) => setTimeout(r, 100));
    if (await isCoreUp()) return true;
    if (child.exitCode !== null) return isCoreUp(); // another core won the race, or it failed
  }
  return false;
}
