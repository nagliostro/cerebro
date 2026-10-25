import { pickLocale } from '@/lib/i18n';
import { reviveCore } from '@/lib/server/core';
import { issueLaunchKey, launchLine } from '@/lib/server/session';

/** On server start: the Dominus core running, and the link to enter shown in the terminal. */
export async function start() {
  if (!(await reviveCore())) console.error('Cerebro: the Dominus core did not start');
  const portuguese = pickLocale(Intl.DateTimeFormat().resolvedOptions().locale) === 'pt-BR';
  console.log(
    launchLine(`http://localhost:${process.env.PORT ?? 3000}`, await issueLaunchKey(), portuguese),
  );
}
