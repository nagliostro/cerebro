import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { publicHost, publicOrigin } from '@/lib/request-guard';
import { appDir, validAppToken } from '@/lib/server/app-links';
import { remoteHost } from '@/lib/server/remote';
import { validNeuronId } from '@/lib/server/require-session';

// Serves one neuron's application files, isolated: the CSP sandbox gives the document an opaque
// origin even if opened on its own, so it never sees the Cerebro's cookies, storage or pages. It
// may load only its own files and the kit, and it reaches the network not at all (connect-src
// 'none'): everything goes through the bridge (neuron-kit/cerebro.js).

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const notFound = () => new Response('Not found', { status: 404 });

function policy(origin: string, id: string) {
  const own = `${origin}/apps/${id}/`;
  const kit = `${origin}/neuron-kit/`;
  return [
    // Downloads: only what the application itself makes (a split PDF, a ZIP); still no network.
    'sandbox allow-scripts allow-forms allow-downloads',
    "default-src 'none'",
    `script-src ${own} ${kit} 'unsafe-inline'`,
    `style-src ${own} ${kit} 'unsafe-inline'`,
    `img-src ${own} data: blob:`,
    `font-src ${own} ${kit}`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; token: string; path?: string[] }> },
) {
  const { id, token, path: parts = [] } = await params;
  if (!validNeuronId(id) || !(await validAppToken(id, token))) return notFound();

  const root = appDir(id);
  let file: string;
  try {
    // Real paths, so neither ".." nor a link can lead outside the application's folder.
    const wanted = path.resolve(root, ...(parts.length ? parts : ['index.html']));
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(wanted)]);
    if (!realFile.startsWith(realRoot + path.sep)) return notFound();
    file = realFile;
  } catch {
    return notFound();
  }
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return notFound();

  // The proxy already checked that this host is this computer or the owner's remote address.
  const remote = await remoteHost();
  const host = publicHost(
    request.headers.get('host'),
    request.headers.get('x-forwarded-host'),
    remote,
  );
  const origin = publicOrigin(host ?? '', remote);
  return new Response(new Uint8Array(await readFile(file)), {
    headers: {
      'content-type': type,
      'content-security-policy': policy(origin, id),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
    },
  });
}
