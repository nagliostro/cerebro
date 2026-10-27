import type { Metadata, Viewport } from 'next';
import { Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import Script from 'next/script';

import { ServiceWorker } from '@/components/service-worker';
import { Starfield } from '@/components/starfield';
import { pickLocale, t } from '@/lib/i18n';
import { KEEP_INSTALL_OFFER } from '@/lib/install-offer';

import './globals.css';

// One typeface in the whole Cerebro.
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const locale = pickLocale((await headers()).get('accept-language'));
  return {
    title: 'Cerebro',
    description: t(locale).description,
    // Installed on a phone, it opens full screen, with its own icon.
    appleWebApp: { capable: true, title: 'Cerebro', statusBarStyle: 'black-translucent' },
    icons: { apple: '/pwa/apple-touch-icon.png' },
  };
}

export const viewport: Viewport = {
  themeColor: '#0f1013',
  colorScheme: 'dark',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = pickLocale((await headers()).get('accept-language'));
  return (
    <html lang={locale}>
      <body className={`${geistMono.variable} flex h-dvh flex-col overflow-hidden`}>
        <Starfield />
        <ServiceWorker />
        {/* The browser's offer to install, kept for Settings (it may come before React). */}
        <Script id="install-offer" strategy="beforeInteractive">
          {KEEP_INSTALL_OFFER}
        </Script>
        {children}
      </body>
    </html>
  );
}
