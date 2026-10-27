import { cookies, headers } from 'next/headers';

import { LOCALE_COOKIE, isLocale, pickLocale } from '@/lib/i18n';
import { coreRequest } from '@/lib/server/core';

import { hasSession, unauthorized } from '@/lib/server/require-session';

// Settings → General → Language: the screens' language for this browser, or back to the
// browser's own ("auto"). Kept in a cookie, so each device keeps its choice.

// Browsers keep a cookie for at most 400 days.
const MAX_AGE = 400 * 24 * 60 * 60;

export async function POST(request: Request) {
  if (!(await hasSession())) return unauthorized();
  const b = (await request.json().catch(() => null)) as { locale?: unknown } | null;
  const jar = await cookies();
  if (b?.locale === 'auto') jar.delete(LOCALE_COOKIE);
  else if (isLocale(b?.locale))
    jar.set(LOCALE_COOKIE, b.locale, { sameSite: 'lax', path: '/', maxAge: MAX_AGE });
  else return Response.json({ error: 'invalid locale' }, { status: 400 });
  // The applications already built follow: the Dominus adjusts the ones written in the other
  // language. Choosing the language stands even if that cannot start.
  const now = b.locale === 'auto' ? pickLocale((await headers()).get('accept-language')) : b.locale;
  const translating = await coreRequest<{ neurons: string[] }>('POST', '/plans/translate', {
    locale: now,
  }).catch(() => ({ neurons: [] }));
  return Response.json({ locale: b.locale, translating: translating.neurons.length });
}
