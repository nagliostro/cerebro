'use client';

import { useEffect } from 'react';

/** Registers the service worker that keeps the offline page (only where browsers allow it). */
export function ServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext)
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
