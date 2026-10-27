import { cookies, headers } from 'next/headers';

import { dataDir } from '@cerebro/dominus/data-dir';

import { DepthChoice, InstallApp, LanguageChoice } from '@/components/settings-general';
import { Block, Line } from '@/components/settings-ui';
import { LOCALE_COOKIE, isLocale, pickLocale, t } from '@/lib/i18n';
import { coreRequest } from '@/lib/server/core';

import pkg from '../../package.json';

// Settings → General: the options of the Cerebro, and what it is.
export default async function General() {
  const locale = pickLocale((await headers()).get('accept-language'));
  const m = t(locale).settings;
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const chosen = isLocale(cookie) ? cookie : 'auto';
  const settings = await coreRequest<{ depth: 'shallow' | 'medium' | 'deep' }>(
    'GET',
    '/settings',
  ).catch(() => ({ depth: 'medium' as const }));
  return (
    <>
      <Block title={m.general.depth}>
        <p className="mb-3">{m.general.depthLead}</p>
        <DepthChoice initial={settings.depth} locale={locale} />
      </Block>
      <Block title={m.general.language}>
        <p className="mb-3">{m.general.languageLead}</p>
        <LanguageChoice initial={chosen} locale={locale} />
      </Block>
      <Block title={m.general.appTitle}>
        <InstallApp locale={locale} />
      </Block>
      <Block title={m.general.about}>
        <dl className="divide-y divide-white/6">
          <Line label={m.general.version} value={pkg.version} />
          <Line label={m.general.data} value={<span className="break-all">{dataDir()}</span>} />
        </dl>
      </Block>
    </>
  );
}
