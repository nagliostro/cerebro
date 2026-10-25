'use client';

import { Laptop, QrCode, Smartphone, Tablet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { t, type Locale } from '@/lib/i18n';
import type { SessionInfo } from '@/lib/server/session';
import type { ChannelStatus } from '@/lib/server/tailscale';

export type DeviceRow = SessionInfo & { current: boolean };
type Pairing = { url: string; svg: string; expiresAt: number };

const PILL =
  'inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-5 transition-colors';
const ICONS = { phone: Smartphone, tablet: Tablet, computer: Laptop };

async function post<T>(path: string, body: object = {}): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error ?? String(res.status)), data ?? {});
  return data as T;
}

/** "agora", "há 2 horas", "há 6 dias", in the owner's language. */
function ago(ms: number, now: number, locale: Locale, nowText: string) {
  const s = Math.round((now - ms) / 1000);
  if (s < 60) return nowText;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86_400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86_400), 'day');
}

/**
 * Who can enter the Cerebro, each device on its own line, and the way to add a phone: access
 * from outside home through the owner's Tailscale, then a one-time QR. Pairing and the channel
 * change only on the computer itself; any device can revoke.
 */
export function DevicesPanel({
  locale,
  initial,
  local,
  channel: initialChannel,
  paired,
}: {
  locale: Locale;
  initial: DeviceRow[];
  local: boolean;
  channel: ChannelStatus | null;
  /** This device just entered by pairing: say so, and how to install the Cerebro. */
  paired: boolean;
}) {
  const m = t(locale).devices;
  const router = useRouter();
  const [devices, setDevices] = useState(initial);
  const [channel, setChannel] = useState(initialChannel);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [left, setLeft] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [now, setNow] = useState(() => initial[0]?.lastSeen ?? 0);

  const reload = useCallback(async () => {
    const res = await fetch('/api/devices');
    if (res.ok) setDevices(await res.json());
  }, []);

  // The clock for "seen 2 hours ago", read once the page is in the browser.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick);
    const every = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);

  // While the code is on the screen: its countdown, and the new phone showing up.
  useEffect(() => {
    if (!pairing) return;
    const count = devices.length;
    const timer = setInterval(async () => {
      const rest = Math.max(0, Math.round((pairing.expiresAt - Date.now()) / 1000));
      setLeft(rest);
      const res = await fetch('/api/devices');
      const list: DeviceRow[] = res.ok ? await res.json() : [];
      if (list.length > count) {
        setDevices(list);
        setPairing(null);
        setNote(m.pairDone);
      } else if (rest === 0) {
        setPairing(null);
        setNote(m.pairExpired);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [pairing, devices.length, m]);

  // Browsers that can install it offer a button of their own (Chrome, Edge, Android).
  useEffect(() => {
    const offer = (e: Event) => {
      e.preventDefault();
      setInstall(e as unknown as { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', offer);
    return () => window.removeEventListener('beforeinstallprompt', offer);
  }, []);

  async function pair() {
    setNote(null);
    try {
      const p = await post<Pairing>('/api/pair');
      setPairing(p);
      setLeft(Math.round((p.expiresAt - Date.now()) / 1000));
    } catch {
      setNote(m.needRemote);
    }
  }

  async function switchRemote(on: boolean) {
    setBusy(true);
    setNote(null);
    try {
      setChannel(await post<ChannelStatus>('/api/remote', { on }));
    } catch (e) {
      setNote(m.failed((e as { detail?: string }).detail ?? (e as Error).message));
    }
    setBusy(false);
  }

  async function revoke(d: DeviceRow) {
    await post(`/api/devices/${d.id}/revoke`).catch(() => undefined);
    if (d.current) router.replace('/locked');
    else void reload();
  }

  const label = (d: DeviceRow) =>
    d.device.browser || d.device.system
      ? [d.device.browser, d.device.system].filter(Boolean).join(' · ')
      : m.unknown;
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const serving = channel?.state === 'serving';

  return (
    <main className="mx-auto mt-10 mb-20 w-[min(100%-32px,560px)]">
      {paired && (
        <section
          aria-label={m.welcome}
          className="mb-10 grid justify-items-center gap-2.5 rounded-[10px] px-4 py-8 text-center shadow-[inset_0_0_0_1px_var(--cb-outline)]"
        >
          <h2 className="text-(--cb-highlight)">{m.welcome}</h2>
          <p>{ios ? m.installIos : m.installOther}</p>
          <div className="mt-2 flex gap-2">
            {install && (
              <button
                type="button"
                onClick={() => void install.prompt()}
                className={`${PILL} bg-white/8 hover:text-white`}
              >
                {m.install}
              </button>
            )}
            <Link href="/" className={`${PILL} bg-white text-[oklch(0.15_0.006_265)]`}>
              {m.openMemory}
            </Link>
          </div>
        </section>
      )}

      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-(--cb-highlight)">{m.title}</h1>
        {local && serving && !pairing && (
          <button
            type="button"
            onClick={() => void pair()}
            className={`${PILL} bg-white text-[oklch(0.15_0.006_265)]`}
          >
            <QrCode aria-hidden className="size-4" />
            {m.pair}
          </button>
        )}
      </div>
      <p>{m.lead}</p>

      {pairing && (
        <section
          aria-label={m.pair}
          className="mt-7 grid justify-items-center gap-3.5 rounded-[10px] px-4 py-6 text-center shadow-[inset_0_0_0_1px_var(--cb-outline)]"
        >
          <p className="text-(--cb-highlight)">{m.pairTitle}</p>
          <div
            role="img"
            aria-label={m.pairCode}
            data-url={pairing.url}
            className="size-46 rounded-[10px] bg-white p-2.5 [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: pairing.svg }}
          />
          <p>{new URL(pairing.url).origin}</p>
          <p>
            {m.pairOnce} ·{' '}
            <span className="text-(--cb-highlight)">
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setPairing(null)}
            className={`${PILL} px-3 hover:text-white`}
          >
            {m.cancel}
          </button>
        </section>
      )}

      {note && (
        <p role="status" className="mt-4 text-(--cb-highlight)">
          {note}
        </p>
      )}

      <ul className="mt-5">
        {/* This one first, then the most recently seen. */}
        {[...devices]
          .sort((a, b) => Number(b.current) - Number(a.current))
          .map((d) => {
            const Icon = ICONS[d.device.kind];
            return (
              <li
                key={d.id}
                className="flex items-center gap-3 py-3.5 shadow-[0_1px_0_oklch(1_0_0/6%)]"
              >
                <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <p className="text-(--cb-highlight)">{m.kind[d.device.kind]}</p>
                  <p>
                    {label(d)}
                    {d.lastSeen > 0 &&
                      now > 0 &&
                      ` · ${m.seen(ago(d.lastSeen, now, locale, m.now))}`}
                  </p>
                </div>
                {d.current && <span>{m.thisOne}</span>}
                <button
                  type="button"
                  onClick={() => void revoke(d)}
                  aria-label={`${m.revoke}: ${m.kind[d.device.kind]}, ${label(d)}`}
                  className={`${PILL} px-3 hover:text-white`}
                >
                  {m.revoke}
                </button>
              </li>
            );
          })}
      </ul>

      <section aria-label={m.remoteTitle} className="mt-12">
        <h2 className="text-(--cb-highlight)">{m.remoteTitle}</h2>
        {!local || !channel ? (
          <p className="mt-1">{m.onlyHere}</p>
        ) : (
          <div className="mt-1 grid justify-items-start gap-3">
            <p>
              {channel.state === 'ready'
                ? m.remote.ready(channel.host)
                : channel.state === 'serving'
                  ? m.remote.serving(`https://${channel.host}`)
                  : m.remote[channel.state]}
            </p>
            {channel.state === 'not-installed' && (
              <a
                href="https://tailscale.com/download"
                target="_blank"
                rel="noopener noreferrer"
                className={`${PILL} bg-white/8 hover:text-white`}
              >
                {m.download}
              </a>
            )}
            {channel.state === 'ready' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void switchRemote(true)}
                className={`${PILL} bg-white text-[oklch(0.15_0.006_265)]`}
              >
                {m.turnOn}
              </button>
            )}
            {serving && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void switchRemote(false)}
                className={`${PILL} px-3 hover:text-white`}
              >
                {m.turnOff}
              </button>
            )}
            {local && !serving && <p>{m.needRemote}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
