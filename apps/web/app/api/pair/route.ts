import QRCode from 'qrcode';

import { hasSession, unauthorized } from '@/lib/server/require-session';
import { issuePairKey, PAIR_PARAM } from '@/lib/server/session';
import { where } from '@/lib/server/where';

// A one-time pairing code, shown as a QR on the computer: the phone's camera opens the remote
// address with it and the phone gets a session of its own. Only from the computer itself, and
// only with the remote address on (the phone could not reach anything else).

export async function POST() {
  if (!(await hasSession())) return unauthorized();
  const { local, remote } = await where();
  if (!local) return Response.json({ error: 'only-here' }, { status: 403 });
  if (!remote) return Response.json({ error: 'no-remote' }, { status: 409 });
  const { key, expiresAt } = await issuePairKey();
  const url = `https://${remote}/?${PAIR_PARAM}=${key}`;
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
  return Response.json({ url, svg, expiresAt });
}
