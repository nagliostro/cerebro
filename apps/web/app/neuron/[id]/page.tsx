import { coreRequest } from '@/lib/server/core';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { NetworkPanel, type Site, type Visited } from '@/components/network-panel';
import { NeuronFrame } from '@/components/neuron-frame';
import { NeuronScreen } from '@/components/neuron-screen';
import { PermissionsPanel } from '@/components/permissions-panel';
import { ToolCard, type InstalledTool } from '@/components/tool-card';
import { TopMenu } from '@/components/top-menu';
import { UsesPanel, type Uses } from '@/components/uses-panel';
import { pickLocale, t } from '@/lib/i18n';
import { appToken, appVersion } from '@/lib/server/app-links';
import { currentPlan } from '@/lib/server/plans';
import { validNeuronId } from '@/lib/server/require-session';

type Neuron = { id: string; name: string; color: string; role: 'life' | 'craft' };
type Contract = { collections: { name: string }[] };
type Permission = {
  caller: string;
  collection: string;
  grants: ('view' | 'create' | 'update' | 'delete')[];
};

// A neuron's screen: at the top its dot and name, the key to its permissions and the pencil to its
// adjustments; below, its application fills the screen, isolated, over the same sky. The menu
// leads back to the Memória.
/** The Navegador's sites: those its researches opened, and in how many of them. */
async function researchSites(id: string): Promise<Visited[]> {
  if (id !== 'navegador') return [];
  const records = await coreRequest<{ data: { sites?: unknown } }[]>(
    'POST',
    `/neurons/${id}/data`,
    { collection: 'researches', op: 'list' },
  ).catch(() => []);
  const count = new Map<string, number>();
  for (const r of records)
    for (const host of Array.isArray(r.data.sites) ? r.data.sites : [])
      if (typeof host === 'string') count.set(host, (count.get(host) ?? 0) + 1);
  return [...count]
    .map(([host, researches]) => ({ host, researches }))
    .sort((a, b) => b.researches - a.researches);
}

export default async function NeuronPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validNeuronId(id)) notFound();
  const locale = pickLocale((await headers()).get('accept-language'));
  const m = t(locale);

  const neuron = await coreRequest<Neuron>('GET', `/neurons/${id}`).catch(() => null);
  if (!neuron) notFound();
  const [contract, permissions, graph, version, plan, sites, visited, uses, tool] =
    await Promise.all([
      coreRequest<Contract>('GET', `/neurons/${id}/contract`),
      coreRequest<Permission[]>('GET', `/neurons/${id}/permissions`),
      coreRequest<{ neurons: Neuron[] }>('GET', '/graph'),
      appVersion(id),
      currentPlan(id),
      coreRequest<Site[]>('GET', `/neurons/${id}/network`).catch(() => []),
      researchSites(id),
      coreRequest<Uses>('GET', `/neurons/${id}/uses`).catch(() => ({ total: 0, items: [] })),
      // Production: the program it carries, if any.
      coreRequest<InstalledTool | null>('GET', `/neurons/${id}/tool`).catch(() => null),
    ]);
  // index.html by name: a folder URL ("/") would be redirected without the slash, and the
  // application's relative files would then lose the token.
  // The version tells the frame when the application really changed (see NeuronFrame).
  const src =
    version === null
      ? null
      : `/apps/${id}/${await appToken(id)}/index.html?locale=${locale}&v=${version}`;

  return (
    <div className="flex flex-1 flex-col">
      <TopMenu
        items={[
          { label: m.menu.memory, href: '/' },
          { label: m.menu.settings, href: '/settings' },
        ]}
        labels={m.menu}
      />
      <NeuronScreen
        locale={locale}
        neuron={neuron}
        others={graph.neurons.map((n) => ({ id: n.id, name: n.name, color: n.color }))}
        initial={plan}
        tools={
          <>
            <UsesPanel neuron={id} name={neuron.name} initial={uses} locale={locale} />
            <NetworkPanel
              neuron={id}
              name={neuron.name}
              initial={sites}
              visited={visited}
              locale={locale}
            />
            <PermissionsPanel
              neuron={id}
              collections={contract.collections.map((c) => c.name)}
              others={graph.neurons
                .filter((n) => n.id !== id)
                .map((n) => ({ id: n.id, name: n.name, color: n.color }))}
              initial={permissions}
              labels={m.permissions(neuron.name)}
            />
          </>
        }
      >
        {src ? (
          <NeuronFrame id={id} src={src} title={m.appTitle(neuron.name)} />
        ) : tool ? (
          <ToolCard tool={tool} m={m.tool} locale={locale} />
        ) : (
          <p className="mx-auto mt-16 w-[min(100%-32px,760px)] text-center">
            {m.appMissing(neuron.name)}
          </p>
        )}
      </NeuronScreen>
    </div>
  );
}
