import { headers } from 'next/headers';

import { isLoopbackHost, publicHost, publicOrigin } from '@/lib/request-guard';

import { remoteHost } from './remote';

/**
 * Where this request comes from, by the address the browser used: this computer (the loopback)
 * or the owner's remote address. Pairing and the remote channel change only from this computer.
 */
export async function where() {
  const h = await headers();
  const remote = await remoteHost();
  const host = publicHost(h.get('host'), h.get('x-forwarded-host'), remote) ?? '';
  const local = isLoopbackHost(host);
  // The port this server answers on, to point the channel to it.
  const port = Number(host.match(/:(\d+)$/)?.[1] ?? process.env.PORT ?? 3000);
  return { local, port, remote, origin: publicOrigin(host, remote) };
}
