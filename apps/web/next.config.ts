import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // No Next.js badge in the corner: the screen starts empty.
  devIndicators: false,
  poweredByHeader: false,
  // The Dominus package is TypeScript source; Next compiles it with the app.
  transpilePackages: ['@cerebro/dominus'],
  // Native module (the system's credential store): loaded by Node, never bundled.
  serverExternalPackages: ['@napi-rs/keyring'],
};

export default nextConfig;
