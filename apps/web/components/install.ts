'use client';

import { useEffect, useState } from 'react';

// Installing the Cerebro as an app. Browsers that can (Chrome, Edge, Android) offer it once per
// page with the "beforeinstallprompt" event, often before React is up: a small script in the
// root layout (lib/install-offer.ts) keeps that offer, so Settings can show it whenever the owner
// asks.

type Offer = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type Kept = Window & { __cbOffer?: Offer | null; __cbInstalled?: boolean };

/**
 * - installed: opened as the app, or just installed;
 * - offer: the browser can install it at a tap;
 * - ios: Safari installs it from Share → Add to Home Screen;
 * - menu: no offer now (some browsers, or already installed and opened in the browser): from the
 *   browser's menu.
 */
export type InstallState = 'unknown' | 'installed' | 'offer' | 'ios' | 'menu';

function read(): InstallState {
  const w = window as Kept;
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || w.__cbInstalled) return 'installed';
  if (w.__cbOffer) return 'offer';
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return 'ios';
  return 'menu';
}

export function useInstall() {
  const [state, setState] = useState<InstallState>('unknown');
  useEffect(() => {
    const update = () => setState(read());
    update();
    addEventListener('cb-install', update);
    return () => removeEventListener('cb-install', update);
  }, []);

  /** Shows the browser's install dialog; the offer works once. */
  async function install() {
    const w = window as Kept;
    const offer = w.__cbOffer;
    if (!offer) return;
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    w.__cbOffer = null;
    if (outcome === 'accepted') w.__cbInstalled = true;
    setState(read());
  }

  return { state, install };
}
