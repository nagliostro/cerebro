import { headers } from 'next/headers';

import { SettingsMenu } from '@/components/settings-menu';
import { TopMenu } from '@/components/top-menu';
import { pickLocale, t } from '@/lib/i18n';

// Settings: the Cerebro's options, its AIs, what they used, the latest runs, the neurons and the
// devices, in sections, as in the Cerebro before.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const m = t(pickLocale((await headers()).get('accept-language')));
  const s = m.settings.sections;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
      <TopMenu
        items={[
          { label: m.menu.memory, href: '/' },
          { label: m.menu.settings, href: '/settings' },
        ]}
        labels={m.menu}
      />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 pt-10 pb-24 md:flex-row md:gap-12">
        <SettingsMenu
          label={m.settings.nav}
          sections={[
            { href: '/settings', name: s.general },
            { href: '/settings/connections', name: s.connections },
            { href: '/settings/usage', name: s.usage },
            { href: '/settings/processes', name: s.processes },
            { href: '/settings/runs', name: s.runs },
            { href: '/settings/neurons', name: s.neurons },
            { href: '/settings/devices', name: s.devices },
          ]}
        />
        <main className="min-w-0 flex-1 md:pt-2.5">{children}</main>
      </div>
    </div>
  );
}
