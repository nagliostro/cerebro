import { headers } from 'next/headers';

import { dataDir } from '@cerebro/dominus/data-dir';

import { Construction } from '@/components/construction';
import { pickLocale, t } from '@/lib/i18n';
import { aiStatus } from '@/lib/server/ai-status';
import { memoryData } from '@/lib/server/memory-data';
import { currentPlan } from '@/lib/server/plans';

import pkg from '../package.json';

// The Memória, the first screen: a dark sky, the Dominus at the center and the neurons around
// it, and the box to ask the Dominus for a new one. A new install has only the Dominus.
// Everything else appears only when the owner acts.
export default async function Home() {
  const locale = pickLocale((await headers()).get('accept-language'));
  const m = t(locale);
  const [status, memory, plan] = await Promise.all([aiStatus(m), memoryData(m), currentPlan(null)]);
  return (
    <Construction
      locale={locale}
      others={memory.neurons.map((n) => ({ id: n.id, name: n.name, color: n.color }))}
      initial={plan}
      memory={{
        dominusLabel: m.dominus,
        dominusLines: [
          { text: m.version(pkg.version) },
          { text: m.dataAt(dataDir()) },
          ...status,
          { text: memory.count },
        ],
        neurons: memory.neurons,
        synapses: memory.synapses,
        links: memory.links,
      }}
    />
  );
}
