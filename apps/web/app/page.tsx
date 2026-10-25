import { headers } from 'next/headers';

import { Dominus } from '@/components/dominus';
import { dataDir } from '@cerebro/dominus/data-dir';
import { pickLocale, t } from '@/lib/i18n';
import { aiStatus } from '@/lib/server/ai-status';

import pkg from '../package.json';

// The empty screen: a dark sky and the Dominus at the center. Everything else appears only
// when the owner acts.
export default async function Home() {
  const m = t(pickLocale((await headers()).get('accept-language')));
  return (
    <main className="grid flex-1 place-items-center px-4">
      <h1 className="sr-only">Cerebro</h1>
      <Dominus
        label={m.dominus}
        lines={[m.version(pkg.version), m.dataAt(dataDir()), ...(await aiStatus(m))]}
      />
    </main>
  );
}
