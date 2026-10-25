import { hasSession, unauthorized } from '@/lib/server/require-session';
import { clearRemoteHost, setRemoteHost } from '@/lib/server/remote';
import { channelStatus, serve, unserve } from '@/lib/server/tailscale';
import { where } from '@/lib/server/where';

// Access from outside home, through the owner's Tailscale: on serves this Cerebro to their own
// devices (HTTPS) and lets that address in; off undoes both. Only from the computer itself.

export async function GET() {
  if (!(await hasSession())) return unauthorized();
  const { local, port } = await where();
  if (!local) return Response.json({ error: 'only-here' }, { status: 403 });
  return Response.json(await channelStatus(port));
}

export async function POST(request: Request) {
  if (!(await hasSession())) return unauthorized();
  const { local, port } = await where();
  if (!local) return Response.json({ error: 'only-here' }, { status: 403 });
  const b = (await request.json().catch(() => null)) as { on?: unknown } | null;
  if (b?.on === true) {
    const status = await channelStatus(port);
    if (status.state !== 'ready' && status.state !== 'serving')
      return Response.json({ error: status.state }, { status: 409 });
    const r = status.state === 'serving' ? ({ ok: true } as const) : await serve(port);
    if (!r.ok)
      return Response.json(
        { error: r.enable ? 'enable' : 'failed', detail: r.detail, enable: r.enable },
        { status: 502 },
      );
    await setRemoteHost(status.host);
  } else if (b?.on === false) {
    await unserve();
    await clearRemoteHost();
  } else return Response.json({ error: 'on must be true or false' }, { status: 400 });
  return Response.json(await channelStatus(port));
}
