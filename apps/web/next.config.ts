import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
