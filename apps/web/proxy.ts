import { NextResponse, type NextRequest } from 'next/server';

import { pickLocale } from '@/lib/i18n';
import { checkRequest } from '@/lib/request-guard';
import {
  createSession,
  hasLiveLaunchKey,
  isValidSession,
  issueLaunchKey,
  KEY_PARAM,
  launchLine,
  redeemLaunchKey,
  SESSION_COOKIE,
} from '@/lib/server/session';

// The door of the Cerebro: every request passes here first. Wrong host or origin is refused;
// a one-time key from the terminal becomes a session; without a session, pages lead to the
// locked screen (the way other sites lead to /login) and everything else gets 401.

const LOCKED = '/locked';
// Browsers keep a cookie for at most 400 days.
const SESSION_MAX_AGE = 400 * 24 * 60 * 60;
const terminalInPortuguese = pickLocale(Intl.DateTimeFormat().resolvedOptions().locale) === 'pt-BR';

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host');
  const verdict = checkRequest({
    method: request.method,
    host,
    origin: request.headers.get('origin'),
  });
  if (verdict !== 'allow') return new NextResponse(null, { status: 403 });

  const url = request.nextUrl;
  // Redirects go back to the host the browser used (nextUrl may say localhost for 127.0.0.1,
  // and a cookie set for one is not sent to the other).
  const here = (path: string) => new URL(path, `http://${host}`);
  const key = url.searchParams.get(KEY_PARAM);
  if (key !== null) {
    // The key never stays in the address bar, used or not.
    const params = new URLSearchParams(url.search);
    params.delete(KEY_PARAM);
    const query = params.size ? `?${params}` : '';
    const response = NextResponse.redirect(here(url.pathname + query), 303);
    if (await redeemLaunchKey(key)) {
      response.cookies.set(SESSION_COOKIE, await createSession(), {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: SESSION_MAX_AGE,
      });
    }
    return response;
  }

  // A neuron's application: no cookie reaches it (sandboxed, opaque origin); the route checks
  // its signed link.
  if (url.pathname.startsWith('/apps/') && request.method === 'GET') return NextResponse.next();

  const signedIn = await isValidSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (signedIn) {
    return url.pathname === LOCKED ? NextResponse.redirect(here('/')) : NextResponse.next();
  }

  const isPage = request.method === 'GET' && !url.pathname.startsWith('/api/');
  if (!isPage) return new NextResponse(null, { status: 401 });

  // Someone is at the door: make sure the terminal has a link they can use.
  if (!(await hasLiveLaunchKey()))
    console.log(launchLine(host!, await issueLaunchKey(), terminalInPortuguese));
  return url.pathname === LOCKED ? NextResponse.next() : NextResponse.redirect(here(LOCKED));
}

export const config = {
  // Static files are the same open-source code for everyone, and so is the neuron kit; they need
  // no session.
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico|neuron-kit/).*)'],
};
