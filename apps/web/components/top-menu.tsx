'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

import { Logo } from './logo';

const SOFT = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * The top menu, collapsed to the sphere with the brain. Touching it gives the sphere a small zoom
 * and opens the pill to the right, with the places appearing one by one. It shows only where it
 * has somewhere to go: the screen that is the only one needs no menu.
 */
export function TopMenu({
  items,
  labels,
}: {
  items: { label: string; href: string }[];
  labels: { nav: string; open: string; close: string };
}) {
  const [open, setOpen] = useState(false);
  const sphere = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      sphere.current?.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.14)' },
          { transform: 'scale(0.96)' },
          { transform: 'scale(1)' },
        ],
        { duration: 460, easing: SOFT },
      );
    setOpen((v) => !v);
  }

  return (
    <nav
      aria-label={labels.nav}
      className={`mx-auto mt-4 flex w-fit items-center rounded-full p-1 transition-[background-color,box-shadow] duration-500 ${
        open ? 'bg-white/6 ring-1 ring-white/8 backdrop-blur-md' : ''
      }`}
    >
      <button
        ref={sphere}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="menu-places"
        aria-label={open ? labels.close : labels.open}
        className="relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-white/90 text-black shadow-[0_0_18px_oklch(1_0_0/0.12)] transition-colors after:absolute after:-inset-1 hover:bg-white"
      >
        <Logo className="size-6" />
      </button>
      {/* The width grows from 0 to its natural size through the grid column (0fr → 1fr). */}
      <div
        id="menu-places"
        inert={!open}
        className="grid transition-[grid-template-columns] duration-500"
        style={{ gridTemplateColumns: open ? '1fr' : '0fr', transitionTimingFunction: SOFT }}
      >
        <ul className="flex min-w-0 items-center overflow-hidden">
          {items.map((item, i) => (
            <li
              key={item.href}
              className={[
                'shrink-0 transition-[opacity,translate] duration-300 first:ml-1',
                open ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0',
              ].join(' ')}
              style={{ transitionDelay: open ? `${140 + i * 70}ms` : '0ms' }}
            >
              <Link
                href={item.href}
                className="block rounded-full px-2.5 py-2.5 whitespace-nowrap transition-colors hover:text-white sm:px-4"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
