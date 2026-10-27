import { privateMtime, readPrivateJson, removePrivate, writePrivateJson } from './private-files';

// The address the owner turned on for their other devices (e.g. "meucerebro.app"), kept in
// the data folder. Only this name, besides this computer's own, is let in by the proxy, so a
// web page can still never reach the Cerebro by DNS rebinding.

const FILE = 'remote.json';

let cache: { mtime: number; host: string | null } | null = null;

export async function remoteHost(): Promise<string | null> {
  const mtime = await privateMtime(FILE);
  if (cache?.mtime !== mtime) {
    const file = await readPrivateJson<{ host?: string }>(FILE);
    cache = { mtime, host: typeof file?.host === 'string' ? file.host.toLowerCase() : null };
  }
  return cache.host;
}

export const setRemoteHost = (host: string) => writePrivateJson(FILE, { host: host.toLowerCase() });
export const clearRemoteHost = () => removePrivate(FILE);
