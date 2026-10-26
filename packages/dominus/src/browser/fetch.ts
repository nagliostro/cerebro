import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';

import { BlockedError, checkUrl, resolvePublic } from './guard.ts';

// What an application gets from the internet, through the Cerebro: a GET to a site the owner
// allowed for that neuron, never anything else. The name is resolved by the guard at connect time
// (the address checked is the address used, so DNS rebinding has no window), redirects are
// followed by hand and each one checked again (public, and allowed for the neuron), and the
// answer has a size and a time limit. No cookies, no credentials, nothing of the owner's goes out.

const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export type NetAnswer = { status: number; type: string; body: string; url: string };

/** The guard as the connection's name lookup: only a public address is ever connected to. */
const publicLookup =
  (port: number): LookupFunction =>
  (hostname, options, callback) => {
    resolvePublic(hostname, port).then(
      (address) => {
        const family = address.includes(':') ? 6 : 4;
        if ((options as { all?: boolean }).all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
      (e: Error) => callback(e as NodeJS.ErrnoException, '', 4),
    );
  };

function once(
  url: URL,
): Promise<{ status: number; type: string; location?: string; body: string }> {
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(
      url,
      {
        lookup: publicLookup(port),
        headers: { accept: 'application/json, text/*;q=0.8', 'user-agent': 'Cerebro' },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers['content-type'] ?? '');
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, type, location: res.headers.location, body: '' });
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy(new BlockedError('answer too large'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () =>
          resolve({ status, type, body: Buffer.concat(chunks).toString('utf8') }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new BlockedError('the site did not answer in time')));
    req.on('error', reject);
  });
}

/** A GET for a neuron; `allowed(host)` says whether the owner allowed that site for it. */
export async function netGet(raw: string, allowed: (host: string) => boolean): Promise<NetAnswer> {
  let url = await checkUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!allowed(url.hostname)) throw new BlockedError(`not allowed: ${url.hostname}`);
    const r = await once(url);
    if (!r.location) return { status: r.status, type: r.type, body: r.body, url: url.href };
    url = await checkUrl(new URL(r.location, url).href);
  }
  throw new BlockedError('too many redirects');
}
