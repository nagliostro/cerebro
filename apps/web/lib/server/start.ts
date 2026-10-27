import { pickLocale } from '@/lib/i18n';
import { startTunnel } from '@/lib/server/cloudflare';
import { reviveCore } from '@/lib/server/core';
import { remoteHost } from '@/lib/server/remote';
import { DEFAULT_PORT } from '@/lib/server/port';
import { issueLaunchKey, launchLine } from '@/lib/server/session';

/**
 * On server start: the Dominus core running, the tunnel to the owner's address when remote
 * access is on, and the link to enter shown in the terminal.
 */
export async function start() {
  if (!(await reviveCore())) console.error('Cerebro: the Dominus core did not start');
  if (await remoteHost()) await startTunnel();
  const locale = pickLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  console.log(
    launchLine(
      `http://localhost:${process.env.PORT ?? DEFAULT_PORT}`,
      await issueLaunchKey(),
      locale,
    ),
  );
}
