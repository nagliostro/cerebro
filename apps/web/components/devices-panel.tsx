'use client';

import { Laptop, QrCode, Smartphone, Tablet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { t, type Locale } from '@/lib/i18n';
import { notify, notifyFailure } from '@/lib/toast';
import type { SessionInfo } from '@/lib/server/session';
import type { ChannelStatus } from '@/lib/server/cloudflare';

import { useInstall } from './install';
import { BTN_PLAIN, BTN_PRIMARY, BTN_SOFT } from './button';
import { Field } from './settings-ui';

export type DeviceRow = SessionInfo & { current: boolean };
type Pairing = { url: string; svg: string; expiresAt: number };

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
 * from outside home through a Cloudflare Tunnel to the owner's domain, then a one-time QR. Pairing and the channel
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
  const tm = t(locale).toast;
  const router = useRouter();
  const [devices, setDevices] = useState(initial);
  const [channel, setChannel] = useState(initialChannel);

  // The Cloudflare page where the owner authorizes this computer, while it waits on them.
  const [signIn, setSignIn] = useState<string | null>(null);
  // The page opens at once; cloudflared answers on its own time (it asks Cloudflare). While it
  // waits on the sign-in in the browser, or connects, it is asked again.
  const waiting = channel?.state === 'connecting' || (channel?.state === 'signed-out' && !!signIn);
  useEffect(() => {
    if (!local || (channel && !waiting)) return;
    let gone = false;
    const ask = () =>
      fetch('/api/remote')
        .then((r) => (r.ok ? r.json() : null))
        .then((c: ChannelStatus | null) => !gone && c && setChannel(c));
    if (!channel) void ask();
    const every = waiting ? setInterval(ask, 3000) : undefined;
    return () => {
      gone = true;
      clearInterval(every);
    };
  }, [local, channel, waiting]);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [left, setLeft] = useState(0);
  // What the owner typed; until then, the address used before.
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const install = useInstall();
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
        notify.success({ title: tm.paired, description: tm.pairedDetail });
      } else if (rest === 0) {
        setPairing(null);
        notify.warning({ title: tm.pairExpired, description: m.pairExpired });
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [pairing, devices.length, m, tm]);

  async function pair() {
    try {
      const p = await post<Pairing>('/api/pair');
      setPairing(p);
      setLeft(Math.round((p.expiresAt - Date.now()) / 1000));
    } catch {
      notify.warning({ title: tm.pairFailed, description: m.needRemote });
    }
  }

  async function switchRemote(on: boolean, host?: string) {
    setBusy(true);
    try {
      setChannel(await post<ChannelStatus>('/api/remote', { on, host }));
    } catch (e) {
      const err = e as { detail?: string; message: string };
      if (err.message === 'bad-host') notify.error({ title: tm.badHost, description: m.badHost });
      else notifyFailure(tm.remoteFailed, err.detail ?? err.message, tm);
    }
    setBusy(false);
  }

  async function startSignIn() {
    setBusy(true);
    try {
      const { url } = await post<{ url: string }>('/api/remote', { signIn: true });
      setSignIn(url);
    } catch (e) {
      notifyFailure(tm.signInFailed, (e as { detail?: string }).detail ?? (e as Error).message, tm);
    }
    setBusy(false);
  }

  async function revoke(d: DeviceRow) {
    try {
      await post(`/api/devices/${d.id}/revoke`);
    } catch (e) {
      return notifyFailure(tm.revokeFailed, e, tm);
    }
    if (d.current) return router.replace('/locked');
    notify.success({
      title: tm.revoked(m.kind[d.device.kind]),
      description: `${label(d)}. ${tm.revokedDetail}`,
    });
    void reload();
  }

  const label = (d: DeviceRow) =>
    d.device.browser || d.device.system
      ? [d.device.browser, d.device.system].filter(Boolean).join(' · ')
      : m.unknown;
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const serving = channel?.state === 'serving';

  return (
    // A section of Settings (its page holds the <main>).
    <div className="max-w-[560px]">
      {paired && (
        <section
          aria-label={m.welcome}
          className="mb-10 grid justify-items-center gap-2.5 rounded-[10px] px-4 py-8 text-center shadow-[inset_0_0_0_1px_var(--cb-outline)]"
        >
          <h2 className="text-(--cb-highlight)">{m.welcome}</h2>
          <p>{ios ? m.installIos : m.installOther}</p>
          <div className="mt-2 flex gap-2">
            {/* Browsers that can install it offer a button of their own (Chrome, Edge, Android). */}
            {install.state === 'offer' && (
              <button type="button" onClick={() => void install.install()} className={BTN_SOFT}>
                {m.install}
              </button>
            )}
            <Link href="/" className={BTN_PRIMARY}>
              {m.openMemory}
            </Link>
          </div>
        </section>
      )}

      {local && serving && !pairing && (
        <div className="mb-2 flex items-center justify-end gap-3">
          <button type="button" onClick={() => void pair()} className={BTN_PRIMARY}>
            <QrCode aria-hidden className="size-4" />
            {m.pair}
          </button>
        </div>
      )}

      {pairing && (
        <section
          aria-label={m.pair}
          className="grid justify-items-center gap-3.5 rounded-[10px] px-4 py-6 text-center shadow-[inset_0_0_0_1px_var(--cb-outline)]"
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
          <button type="button" onClick={() => setPairing(null)} className={BTN_PLAIN}>
            {m.cancel}
          </button>
        </section>
      )}

      <ul className="mt-5 first:mt-0">
        {/* This one first, then the most recently seen. */}
        {[...devices]
          .sort((a, b) => Number(b.current) - Number(a.current))
          .map((d) => {
            const Icon = ICONS[d.device.kind];
            return (
              <li
                key={d.id}
                className="flex items-center gap-3 py-3.5 shadow-[0_1px_0_oklch(1_0_0/6%)] first:pt-0"
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
                  className={BTN_PLAIN}
                >
                  {m.revoke}
                </button>
              </li>
            );
          })}
      </ul>

      <section aria-label={m.remoteTitle} className="mt-8 border-t border-white/6 pt-8">
        <h2 className="text-(--cb-highlight)">{m.remoteTitle}</h2>
        {!local ? (
          <p className="mt-1">{m.onlyHere}</p>
        ) : !channel ? (
          <p className="mt-1">{m.checkingRemote}</p>
        ) : (
          <div className="mt-1 grid justify-items-start gap-3">
            <p>
              {channel.state === 'serving'
                ? m.remote.serving(`https://${channel.host}`)
                : channel.state === 'connecting'
                  ? m.remote.connecting(channel.host)
                  : channel.state === 'not-running'
                    ? m.remote.notRunning(channel.detail)
                    : channel.state === 'signed-out' && signIn
                      ? m.remote.signingIn
                      : m.remote[channel.state]}
            </p>
            {channel.state === 'not-installed' && (
              <a
                href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
                target="_blank"
                rel="noopener noreferrer"
                className={BTN_SOFT}
              >
                {m.download}
              </a>
            )}
            {channel.state === 'signed-out' &&
              (signIn ? (
                <a href={signIn} target="_blank" rel="noopener noreferrer" className={BTN_SOFT}>
                  {m.openSignIn}
                </a>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startSignIn()}
                  className={BTN_PRIMARY}
                >
                  {m.signIn}
                </button>
              ))}
            {channel.state === 'ready' && (
              <form
                aria-label={m.turnOn}
                className="grid w-full max-w-sm justify-items-start gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void switchRemote(true, address ?? channel.host ?? '');
                }}
              >
                <Field
                  id="remote-address"
                  label={m.address}
                  value={address ?? channel.host ?? ''}
                  onChange={setAddress}
                />
                <button
                  type="submit"
                  disabled={busy || !(address ?? channel.host)}
                  className={BTN_PRIMARY}
                >
                  {busy ? m.turningOn : m.turnOn}
                </button>
              </form>
            )}
            {(serving || channel.state === 'connecting' || channel.state === 'not-running') && (
              <div className="flex flex-wrap gap-2">
                {channel.state === 'not-running' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchRemote(true, channel.host)}
                    className={BTN_PRIMARY}
                  >
                    {m.turnOnAgain}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void switchRemote(false)}
                  className={BTN_PLAIN}
                >
                  {m.turnOff}
                </button>
              </div>
            )}
            {local && !serving && <p>{m.needRemote}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
