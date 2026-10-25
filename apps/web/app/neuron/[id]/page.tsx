import { coreRequest } from '@/lib/server/core';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { Construction } from '@/components/construction';
import { NeuronFrame } from '@/components/neuron-frame';
import { PermissionsPanel } from '@/components/permissions-panel';
import { TopMenu } from '@/components/top-menu';
import { pickLocale, t } from '@/lib/i18n';
import { appToken, hasApp } from '@/lib/server/app-links';
import { currentPlan } from '@/lib/server/plans';
import { validNeuronId } from '@/lib/server/require-session';

type Neuron = { id: string; name: string; color: string; role: 'life' | 'craft' };
type Contract = { collections: { name: string }[] };
type Permission = {
  caller: string;
  collection: string;
  grants: ('view' | 'create' | 'update' | 'delete')[];
};

// A neuron's screen: at the top only its dot and name, and the key to its permissions; below, its
// application fills the screen, isolated, over the same sky; at the foot, the Dominus box to ask
// for a change (or for its first application). The menu leads back to the Memória.
export default async function NeuronPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validNeuronId(id)) notFound();
  const locale = pickLocale((await headers()).get('accept-language'));
  const m = t(locale);

  const neuron = await coreRequest<Neuron>('GET', `/neurons/${id}`).catch(() => null);
  if (!neuron) notFound();
  const [contract, permissions, graph, built, plan] = await Promise.all([
    coreRequest<Contract>('GET', `/neurons/${id}/contract`),
    coreRequest<Permission[]>('GET', `/neurons/${id}/permissions`),
    coreRequest<{ neurons: Neuron[] }>('GET', '/graph'),
    hasApp(id),
    currentPlan(id),
  ]);
  // index.html by name: a folder URL ("/") would be redirected without the slash, and the
  // application's relative files would then lose the token.
  const src = built ? `/apps/${id}/${await appToken(id)}/index.html` : null;

  return (
    <div className="flex flex-1 flex-col">
      <TopMenu
        items={[
          { label: m.menu.memory, href: '/' },
          { label: m.menu.devices, href: '/devices' },
        ]}
        labels={m.menu}
      />
      <header className="mx-auto mt-5 flex w-[min(100%-32px,760px)] items-center gap-2">
        <h1 className="mr-auto flex items-center gap-2.5 text-(--cb-highlight)">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: neuron.color, boxShadow: `0 0 12px ${neuron.color}` }}
          />
          {neuron.name}
        </h1>
        <PermissionsPanel
          neuron={id}
          collections={contract.collections.map((c) => c.name)}
          others={graph.neurons
            .filter((n) => n.id !== id)
            .map((n) => ({ id: n.id, name: n.name, color: n.color }))}
          initial={permissions}
          labels={m.permissions(neuron.name)}
        />
      </header>
      {src ? (
        <NeuronFrame id={id} src={src} title={m.appTitle(neuron.name)} />
      ) : (
        <p className="mx-auto mt-16 w-[min(100%-32px,760px)] text-center">
          {m.appMissing(neuron.name)}
        </p>
      )}
      <Construction
        key={id}
        locale={locale}
        others={graph.neurons.map((n) => ({ id: n.id, name: n.name, color: n.color }))}
        target={{ id, name: neuron.name }}
        initial={plan}
      />
    </div>
  );
}
