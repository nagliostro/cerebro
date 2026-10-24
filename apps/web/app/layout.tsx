import type { Metadata, Viewport } from 'next';
import { Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';

import { Starfield } from '@/components/starfield';
import { pickLocale, t } from '@/lib/i18n';

import './globals.css';

// One typeface in the whole Cerebro.
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const locale = pickLocale((await headers()).get('accept-language'));
  return { title: 'Cerebro', description: t(locale).description };
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
        {children}
      </body>
    </html>
  );
}
