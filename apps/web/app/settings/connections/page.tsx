import { headers } from 'next/headers';

import {
  ConnectionsPanel,
  type ConnectionRow,
  type Preset,
  type ProviderHealth,
} from '@/components/settings-connections';
import { Header } from '@/components/settings-ui';
import { pickLocale, t } from '@/lib/i18n';
import { coreRequest } from '@/lib/server/core';

// Settings → Connections: the subscription (its official program) and the API connections.
export default async function Connections() {
  const locale = pickLocale((await headers()).get('accept-language'));
  const m = t(locale).settings;
  const [providers, connections] = await Promise.all([
    coreRequest<ProviderHealth[]>('GET', '/providers').catch(() => []),
    coreRequest<{ vault: boolean; presets: Record<string, Preset>; list: ConnectionRow[] }>(
      'GET',
      '/connections',
    ).catch(() => ({ vault: false, presets: {}, list: [] })),
  ]);
  return (
    <>
      <Header title={m.sections.connections} text={m.connections.lead} />
      <ConnectionsPanel
        locale={locale}
        providers={providers.filter((p) => p.id !== 'simulated')}
        presets={connections.presets}
        initial={connections.list}
      />
    </>
  );
}
