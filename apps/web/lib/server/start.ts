import path from 'node:path';

import { ensureCore } from '@cerebro/dominus/client';

import { pickLocale } from '@/lib/i18n';
import { issueLaunchKey, launchLine } from '@/lib/server/session';

/** On server start: the Dominus core running, and the link to enter shown in the terminal. */
export async function start() {
  // The server always runs from apps/web (pnpm and the tests start it there).
  const core = path.join(process.cwd(), '..', '..', 'packages', 'dominus', 'src', 'core.ts');
  if (!(await ensureCore(core))) console.error('Cerebro: the Dominus core did not start');
  const portuguese = pickLocale(Intl.DateTimeFormat().resolvedOptions().locale) === 'pt-BR';
  console.log(
    launchLine(`http://localhost:${process.env.PORT ?? 3000}`, await issueLaunchKey(), portuguese),
  );
}
