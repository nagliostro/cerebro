import { headers } from 'next/headers';

import { dataDir } from '@cerebro/dominus/data-dir';

import { DepthChoice } from '@/components/settings-general';
import { Block, Header, Line } from '@/components/settings-ui';
import { pickLocale, t } from '@/lib/i18n';
import { coreRequest } from '@/lib/server/core';

import pkg from '../../package.json';

// Settings → General: the options of the Cerebro, and what it is.
export default async function General() {
  const locale = pickLocale((await headers()).get('accept-language'));
  const m = t(locale).settings;
  const settings = await coreRequest<{ depth: 'shallow' | 'medium' | 'deep' }>(
    'GET',
    '/settings',
  ).catch(() => ({ depth: 'medium' as const }));
  return (
    <>
      <Header title={m.sections.general} text={m.general.lead} />
      <Block title={m.general.depth}>
        <p className="mb-3">{m.general.depthLead}</p>
        <DepthChoice initial={settings.depth} locale={locale} />
      </Block>
      <Block title={m.general.about}>
        <dl className="divide-y divide-white/6">
          <Line label={m.general.version} value={pkg.version} />
          <Line label={m.general.data} value={<span className="break-all">{dataDir()}</span>} />
          <Line label={m.general.language} value={m.general.languageValue} />
        </dl>
      </Block>
    </>
  );
}
