import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { NextConfig } from 'next';

import { dataDir } from '../../packages/dominus/src/data-dir';

/**
 * The remote address turned on in Devices (e.g. "meucerebro.app"), read when the server starts.
 * In development Next refuses its own scripts' live connection to any other address, and the
 * page on the phone never becomes interactive; production has no such connection.
 */
function remoteHost(): string[] {
  try {
    const { host } = JSON.parse(readFileSync(path.join(dataDir(), 'remote.json'), 'utf8'));
    return typeof host === 'string' ? [host] : [];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  // Restart `pnpm dev` after turning remote access on for a new address.
  allowedDevOrigins: remoteHost(),
  // No Next.js badge in the corner: the screen starts empty.
  devIndicators: false,
  poweredByHeader: false,
  // The Dominus package is TypeScript source; Next compiles it with the app.
  transpilePackages: ['@cerebro/dominus'],
  // Native module (the system's credential store): loaded by Node, never bundled.
  serverExternalPackages: ['@napi-rs/keyring'],
  // The neuron kit is public and the same for everyone. Applications run with an opaque origin
  // ("null"), and fonts load only with CORS: without this the kit's font never reaches them.
  async headers() {
    return [
      {
        source: '/neuron-kit/:file*',
        headers: [{ key: 'access-control-allow-origin', value: '*' }],
      },
    ];
  },
};

export default nextConfig;
