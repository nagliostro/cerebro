import { headers } from 'next/headers';

import { DOMINUS_COLOR, NeuronDot } from '@/components/neuron-dot';
import { pickLocale, t } from '@/lib/i18n';

// The screen of a browser without a session: the Dominus at rest and the one thing to do.
// The proxy shows it in place of any page; the link it asks for is in the terminal.
export default async function Locked() {
  const m = t(pickLocale((await headers()).get('accept-language')));
  return (
    <main className="grid flex-1 place-items-center px-4">
      <h1 className="sr-only">Cerebro</h1>
      <div className="relative flex flex-col items-center">
        <NeuronDot color={DOMINUS_COLOR} label={m.dominus} />
        <p className="absolute top-full mt-3 w-[min(90vw,32rem)] text-center">{m.locked}</p>
      </div>
    </main>
  );
}
