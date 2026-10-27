import { headers } from 'next/headers';

import { RunsPanel, type Run } from '@/components/settings-runs';
import { pickLocale, t } from '@/lib/i18n';
import { coreRequest } from '@/lib/server/core';

// Settings → Runs: the latest jobs of the Dominus, never their prompts.
export default async function Runs() {
  const locale = pickLocale((await headers()).get('accept-language'));
  const m = t(locale).settings;
  const runs = await coreRequest<Run[]>('GET', '/runs').catch(() => []);
  return (
    <>
      <RunsPanel
        runs={runs.filter((r) => r.type !== 'steps' && r.type !== 'hang')}
        locale={locale}
      />
    </>
  );
}
