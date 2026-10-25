import { headers } from 'next/headers';

import { dataDir } from '@cerebro/dominus/data-dir';

import { Memory } from '@/components/memory';
import { pickLocale, t } from '@/lib/i18n';
import { aiStatus } from '@/lib/server/ai-status';
import { memoryData } from '@/lib/server/memory-data';

import pkg from '../package.json';

// The Memória, the first screen: a dark sky, the Dominus at the center and the neurons around
// it. A new install has only the Dominus. Everything else appears only when the owner acts.
export default async function Home() {
  const m = t(pickLocale((await headers()).get('accept-language')));
  const [status, memory] = await Promise.all([aiStatus(m), memoryData(m)]);
  return (
    <Memory
      dominusLabel={m.dominus}
      dominusLines={[
        { text: m.version(pkg.version) },
        { text: m.dataAt(dataDir()) },
        ...status,
        { text: memory.count },
      ]}
      neurons={memory.neurons}
      synapses={memory.synapses}
      links={memory.links}
    />
  );
}
