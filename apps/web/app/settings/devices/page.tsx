import { cookies, headers } from 'next/headers';

import { DevicesPanel } from '@/components/devices-panel';
import { pickLocale } from '@/lib/i18n';
import { listSessions, SESSION_COOKIE, sessionId } from '@/lib/server/session';
import { channelStatus } from '@/lib/server/tailscale';
import { where } from '@/lib/server/where';

// Settings → Devices: who can enter the Cerebro, and pairing a phone (access from outside home
// through the owner's Tailscale, then a one-time QR). The channel is read only on the computer.
export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ paired?: string }>;
}) {
  const locale = pickLocale((await headers()).get('accept-language'));
  const { local, port } = await where();
  const current = sessionId((await cookies()).get(SESSION_COOKIE)?.value ?? '');
  const [devices, channel] = await Promise.all([
    listSessions(),
    local ? channelStatus(port) : Promise.resolve(null),
  ]);
  return (
    <DevicesPanel
      locale={locale}
      initial={devices.map((d) => ({ ...d, current: d.id === current }))}
      local={local}
      channel={channel}
      paired={(await searchParams).paired === '1'}
    />
  );
}
