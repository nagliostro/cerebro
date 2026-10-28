'use client';

import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';

/**
 * Where the notices of lib/toast.ts appear: at the top, in the middle, under the menu, the way
 * iOS and macOS show theirs, clear of the Dominus box and the captions at the foot. Dark glass,
 * the Cerebro's text, an icon in the kind's quiet color; the look is in globals.css (.cb-toast).
 */
export function Toaster({ labels }: { labels: { region: string; close: string } }) {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      offset={{ top: 72 }}
      mobileOffset={{ top: 68, left: 16, right: 16 }}
      gap={8}
      visibleToasts={3}
      closeButton
      containerAriaLabel={labels.region}
      icons={{
        success: <CircleCheck size={16} strokeWidth={1.75} />,
        error: <CircleAlert size={16} strokeWidth={1.75} />,
        warning: <TriangleAlert size={16} strokeWidth={1.75} />,
        info: <Info size={16} strokeWidth={1.75} />,
        loading: <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" />,
        close: <X size={12} strokeWidth={1.75} />,
      }}
      toastOptions={{ className: 'cb-toast', closeButtonAriaLabel: labels.close }}
    />
  );
}
