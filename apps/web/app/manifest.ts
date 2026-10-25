import type { MetadataRoute } from 'next';

// What a phone needs to install the Cerebro as an app: its name, the dark sky and the icons.
// The manifest is the same for everyone (served without a session).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cerebro',
    short_name: 'Cerebro',
    description: 'O ajudante do seu cérebro: as áreas e os objetivos da sua vida, conectados.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f1013',
    theme_color: '#0f1013',
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
