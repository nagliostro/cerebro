import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';

import { BlockedError, resolvePublic } from './guard.ts';

// The Navegador's only way out: an HTTP proxy on the loopback that the browser must use for
// everything (CONNECT for https and websockets, absolute URLs for plain http). It resolves each
// host itself and connects to the checked address, so what the browser asked for and where the
// bytes go are the same.

export type GuardProxy = {
  /** http://127.0.0.1:port, for the browser's proxy setting. */
  url: string;
  /** What was refused, for the record. */
  blocked: () => string[];
  close: () => Promise<void>;
};

const BLOCKED_BODY = 'Blocked by the Cerebro: only public sites can be opened.';

export async function startGuardProxy(): Promise<GuardProxy> {
  const refused: string[] = [];
  const sockets = new Set<net.Socket>();
  const refuse = (what: string, e: unknown) => {
    if (refused.length < 50) refused.push(`${what}: ${(e as Error).message}`);
  };

  const server = http.createServer(async (req, res) => {
    // Plain http comes in absolute form: GET http://host/path.
    let target: URL;
    try {
      target = new URL(req.url ?? '');
      if (target.protocol !== 'http:') throw new BlockedError(target.protocol);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const port = Number(target.port) || 80;
    let address: string;
    try {
      address = await resolvePublic(target.hostname, port);
    } catch (e) {
      refuse(target.host, e);
      res.writeHead(403, { 'content-type': 'text/plain' }).end(BLOCKED_BODY);
      return;
    }
    const headers = { ...req.headers };
    delete headers['proxy-connection'];
    delete headers['proxy-authorization'];
    const out = http.request(
      { host: address, port, method: req.method, path: target.pathname + target.search, headers },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    out.on('error', () => res.writeHead(502).end());
    req.pipe(out);
  });

  server.on('connect', async (req, client: net.Socket, head: Buffer) => {
    sockets.add(client);
    client.on('close', () => sockets.delete(client));
    client.on('error', () => client.destroy());
    const [host, portText] = (req.url ?? '').split(/:(?=\d+$)/);
    const port = Number(portText);
    let address: string;
    try {
      if (!host || !Number.isInteger(port)) throw new BlockedError('bad target');
      address = await resolvePublic(host, port);
    } catch (e) {
      refuse(req.url ?? '', e);
      client.end('HTTP/1.1 403 Forbidden\r\ncontent-type: text/plain\r\n\r\n' + BLOCKED_BODY);
      return;
    }
    const upstream = net.connect({ host: address, port }, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    sockets.add(upstream);
    upstream.on('close', () => sockets.delete(upstream));
    upstream.on('error', () => client.destroy());
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    blocked: () => [...refused],
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
