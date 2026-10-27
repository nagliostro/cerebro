import Link from 'next/link';

import type { Locale, Messages } from '@/lib/i18n';

export type InstalledTool = {
  repo: string;
  tag: string;
  date: string;
  asset: { name: string; bytes: number; url: string };
  sha256: string;
  checksum: 'github' | 'author';
  license: string;
  program: string;
  version: string | null;
  installedAt: number;
};

/**
 * A Production neuron's screen: no application, the program it carries. Where it came from
 * (pinned release, file and checksum), what its test answered, and how to uninstall it.
 */
export function ToolCard({
  tool,
  m,
  locale,
}: {
  tool: InstalledTool;
  m: Messages['tool'];
  locale: Locale;
}) {
  const rows: [string, React.ReactNode][] = [
    [
      m.from,
      <a
        key="from"
        href={`https://github.com/${tool.repo}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-(--cb-highlight) underline decoration-white/25 underline-offset-[3px]"
      >
        github.com/{tool.repo}
      </a>,
    ],
    [m.release, tool.tag],
    [m.file, tool.asset.name],
    [m.program, `tool/${tool.program}`],
    [m.answered, tool.version ?? m.helpOnly],
    [m.license, tool.license],
    [
      m.checksum,
      <span key="sha" className="break-all">
        {tool.sha256}
      </span>,
    ],
    [
      m.installed,
      new Date(tool.installedAt).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    ],
  ];
  return (
    <section
      aria-label={m.title}
      className="mx-auto mt-16 grid w-[min(100%-32px,760px)] gap-[18px] [overflow-wrap:anywhere]"
    >
      <h2 className="text-(--cb-highlight)">{m.title}</h2>
      <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className="text-(--cb-highlight)">{v}</dd>
          </div>
        ))}
      </dl>
      <p>{m.note}</p>
      <p>
        <Link
          href="/settings/neurons"
          className="underline decoration-white/25 underline-offset-[3px]"
        >
          {m.remove}
        </Link>
      </p>
    </section>
  );
}
