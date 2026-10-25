// Who may talk to the Cerebro. The server listens only on the loopback, but a web page in the
// owner's browser can still reach it: by DNS rebinding (an attacker's name pointing to
// 127.0.0.1, which arrives with the attacker's Host) or by CSRF (a form or fetch from another
// site, which arrives with another Origin). Both are refused here, before any session check.

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The Host header names this computer: localhost, 127.0.0.1 or [::1], on any port. */
export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.toLowerCase().replace(/:\d+$/, '');
  return LOOPBACK_NAMES.has(name);
}

/** Methods that only read. Everything else changes something and must prove its origin. */
export function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

/**
 * A request that changes something must come from a Cerebro page: browsers send Origin on
 * every such request, and it must name the same host and port the request went to. A missing
 * Origin is refused too, so nothing depends on the browser being well behaved.
 */
export function isSameOrigin(origin: string | null | undefined, host: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export type Verdict = 'allow' | 'wrong-host' | 'wrong-origin';

export function checkRequest(req: {
  method: string;
  host: string | null;
  origin: string | null;
}): Verdict {
  if (!isLoopbackHost(req.host)) return 'wrong-host';
  if (!isSafeMethod(req.method) && !isSameOrigin(req.origin, req.host!)) return 'wrong-origin';
  return 'allow';
}
