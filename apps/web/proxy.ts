import { NextResponse, type NextRequest } from 'next/server';

import { pickLocale } from '@/lib/i18n';
import { checkRequest, publicHost, publicOrigin } from '@/lib/request-guard';
import { remoteHost } from '@/lib/server/remote';
import {
  createSession,
  deviceFrom,
  hasLiveLaunchKey,
  isValidSession,
  issueLaunchKey,
  KEY_PARAM,
  launchLine,
  PAIR_PARAM,
  redeemLaunchKey,
  redeemPairKey,
  SESSION_COOKIE,
  touchSession,
} from '@/lib/server/session';

// The door of the Cerebro: every request passes here first. Wrong host or origin is refused;
// a one-time key from the terminal, or a pairing code shown on the computer, becomes a session
// for that device; without a session, pages lead to the locked screen (the way other sites lead
// to /login) and everything else gets 401.

const LOCKED = '/locked';
// Browsers keep a cookie for at most 400 days.
const SESSION_MAX_AGE = 400 * 24 * 60 * 60;
const terminalInPortuguese = pickLocale(Intl.DateTimeFormat().resolvedOptions().locale) === 'pt-BR';

export async function proxy(request: NextRequest) {
  const remote = await remoteHost();
  const forwardedHost = request.headers.get('x-forwarded-host');
  const verdict = checkRequest({
    method: request.method,
    host: request.headers.get('host'),
    origin: request.headers.get('origin'),
    forwardedHost,
    remote,
  });
  if (verdict !== 'allow') return new NextResponse(null, { status: 403 });

  const host = publicHost(request.headers.get('host'), forwardedHost, remote)!;
  const origin = publicOrigin(host, remote);
  const url = request.nextUrl;
  // Redirects go back to the address the browser used (nextUrl may say localhost for 127.0.0.1,
  // and a cookie set for one is not sent to the other).
  const here = (path: string) => new URL(path, origin);

  for (const [param, redeem, landing] of [
    [KEY_PARAM, redeemLaunchKey, null],
    // A paired phone lands on its welcome, which says how to add the Cerebro to its home screen.
    [PAIR_PARAM, redeemPairKey, '/devices?paired=1'],
  ] as const) {
    const key = url.searchParams.get(param);
    if (key === null) continue;
    // The key never stays in the address bar, used or not.
    const params = new URLSearchParams(url.search);
    params.delete(param);
    const query = params.size ? `?${params}` : '';
    const ok = await redeem(key);
    const response = NextResponse.redirect(
      here(ok && landing ? landing : url.pathname + query),
      303,
    );
    if (ok) {
      const device = deviceFrom(request.headers.get('user-agent'));
      response.cookies.set(SESSION_COOKIE, await createSession(device), {
        httpOnly: true,
        sameSite: 'strict',
        secure: origin.startsWith('https:'),
        path: '/',
        maxAge: SESSION_MAX_AGE,
      });
    }
    return response;
  }

  // A neuron's application: no cookie reaches it (sandboxed, opaque origin); the route checks
  // its signed link.
  if (url.pathname.startsWith('/apps/') && request.method === 'GET') return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(token)) {
    await touchSession(token);
    return url.pathname === LOCKED ? NextResponse.redirect(here('/')) : NextResponse.next();
  }

  const isPage = request.method === 'GET' && !url.pathname.startsWith('/api/');
  if (!isPage) return new NextResponse(null, { status: 401 });

  // Someone is at the door: make sure the terminal has a link they can use.
  if (!(await hasLiveLaunchKey()))
    console.log(launchLine(origin, await issueLaunchKey(), terminalInPortuguese));
  return url.pathname === LOCKED ? NextResponse.next() : NextResponse.redirect(here(LOCKED));
}

export const config = {
  // Static files are the same open-source code for everyone, and so are the neuron kit and what
  // a phone needs to install the Cerebro (manifest, icons, the service worker and its offline
  // page); they need no session.
  matcher: [
    '/((?!_next/static|_next/image|icon.svg|favicon.ico|neuron-kit/|manifest.webmanifest|pwa/|sw.js|offline.html).*)',
  ],
};
