import { hasSession, unauthorized } from '@/lib/server/require-session';
import { revokeSession } from '@/lib/server/session';

// Takes one device out at once. Revoking this one signs it out; the terminal always gives the
// computer a new link.

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  if (!/^[0-9a-f]{16}$/.test(id) || !(await revokeSession(id)))
    return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ ok: true });
}
