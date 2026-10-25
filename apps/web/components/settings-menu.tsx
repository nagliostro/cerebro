'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The sections of Settings, as in the Claude settings screen and the Cerebro before: a column on
// the left on a computer; on a phone, a strip above the content that scrolls sideways.

export function SettingsMenu({
  label,
  sections,
}: {
  label: string;
  sections: { href: string; name: string }[];
}) {
  const here = usePathname();
  return (
    <nav aria-label={label} className="shrink-0 md:w-44">
      <ul className="-mx-4 flex [scrollbar-width:none] gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
        {sections.map((s) => {
          const current = here === s.href;
          return (
            <li key={s.href} className="shrink-0">
              <Link
                href={s.href}
                aria-current={current ? 'page' : undefined}
                className={`flex h-11 items-center rounded-[10px] px-3.5 whitespace-nowrap transition-colors md:h-10 ${
                  current ? 'bg-white/8 text-(--cb-highlight)' : 'hover:text-(--cb-highlight)'
                }`}
              >
                {s.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
