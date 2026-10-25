import { existsSync } from 'node:fs';
import path from 'node:path';

import { headers } from 'next/headers';

import { dataDir } from '@cerebro/dominus/data-dir';

import { NeuronsPanel, type NeuronRow } from '@/components/settings-neurons';
import { Header } from '@/components/settings-ui';
import { pickLocale, t } from '@/lib/i18n';
import { coreRequest } from '@/lib/server/core';

// Settings → Neurons: each neuron, its role and weight, and renaming, changing the role or
// removing it for good.
export default async function Neurons() {
  const locale = pickLocale((await headers()).get('accept-language'));
  const m = t(locale).settings;
  const graph = await coreRequest<{ neurons: Omit<NeuronRow, 'built'>[] }>('GET', '/graph').catch(
    () => ({ neurons: [] }),
  );
  const rows = graph.neurons.map((n) => ({
    ...n,
    built: existsSync(path.join(dataDir(), 'neurons', n.id, 'app', 'index.html')),
  }));
  return (
    <>
      <Header title={m.sections.neurons} text={m.neurons.lead} />
      <NeuronsPanel initial={rows} locale={locale} />
    </>
  );
}
