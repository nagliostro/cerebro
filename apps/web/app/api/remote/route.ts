import { channelStatus, signIn, turnOff, turnOn } from '@/lib/server/cloudflare';
import { hasSession, unauthorized } from '@/lib/server/require-session';
import { where } from '@/lib/server/where';

// Access from outside home, through a Cloudflare Tunnel to the owner's own domain: sign in once,
// then on puts this Cerebro at that address and lets it in; off undoes it. Only from the
// computer itself.

export async function GET() {
  if (!(await hasSession())) return unauthorized();
  const { local } = await where();
  if (!local) return Response.json({ error: 'only-here' }, { status: 403 });
  return Response.json(await channelStatus());
}

export async function POST(request: Request) {
  if (!(await hasSession())) return unauthorized();
  const { local, port } = await where();
  if (!local) return Response.json({ error: 'only-here' }, { status: 403 });
  const b = (await request.json().catch(() => null)) as {
    on?: unknown;
    host?: unknown;
    signIn?: unknown;
  } | null;
  if (b?.signIn === true) {
    const url = await signIn();
    if (!url) return Response.json({ error: 'failed', detail: 'sign-in' }, { status: 502 });
    return Response.json({ url });
  }
  if (b?.on === true) {
    if (typeof b.host !== 'string') return Response.json({ error: 'bad-host' }, { status: 400 });
    const r = await turnOn(b.host, port);
    if (!r.ok)
      return Response.json(
        { error: r.error, detail: r.detail },
        { status: r.error === 'bad-host' ? 400 : 502 },
      );
  } else if (b?.on === false) await turnOff();
  else return Response.json({ error: 'on must be true or false' }, { status: 400 });
  return Response.json(await channelStatus());
}
