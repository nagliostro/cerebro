'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { t, type Locale, type Messages } from '@/lib/i18n';
import { notify, notifyFailure } from '@/lib/toast';

import { Block, Field, PLAIN, post, PRIMARY, SOFT } from './settings-ui';

type Role = 'cheap' | 'balanced' | 'strong';
const ROLES: Role[] = ['cheap', 'balanced', 'strong'];

export type ProviderHealth = {
  id: string;
  name: string;
  capabilities: { billing: 'plan' | 'api' | 'local' };
  health: { ok: true; version: string } | { ok: false; problem: string; detail?: string };
};
export type Preset = { name: string; baseUrl: string; models: Record<Role, string>; key: boolean };
export type ConnectionRow = {
  id: string;
  name: string;
  baseUrl: string;
  models: Record<Role, string>;
  billing: 'api' | 'local';
  monthlyCapUsd: number | null;
  needsKey: boolean;
  hasKey: boolean;
};

type Form = {
  id: string;
  preset: string;
  name: string;
  baseUrl: string;
  key: string;
  models: Record<Role, string>;
  cap: string;
};

function healthText(
  h: ProviderHealth['health'] | undefined,
  m: Messages['settings']['connections'],
) {
  if (!h) return '';
  if (h.ok) return m.ok(h.version);
  return m.problem[h.problem as keyof typeof m.problem] ?? h.problem;
}

/**
 * The AIs of the Cerebro: the subscription through its official program, and the API
 * connections, each with where it sends, its models and a key that lives only in the vault.
 */
export function ConnectionsPanel({
  locale,
  providers,
  presets,
  initial,
}: {
  locale: Locale;
  providers: ProviderHealth[];
  presets: Record<string, Preset>;
  initial: ConnectionRow[];
}) {
  const all = t(locale);
  const m = all.settings.connections;
  const router = useRouter();
  const [health, setHealth] = useState(new Map(providers.map((p) => [p.id, p.health])));
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const subscriptions = providers.filter((p) => p.capabilities.billing === 'plan');
  const fail = (title: string) => (e: unknown) =>
    (e as Error).message === 'no-vault'
      ? notify.error({ title: all.toast.keyNotSaved, description: m.noVault })
      : notifyFailure(title, e, all.toast);

  async function check() {
    setChecking(true);
    try {
      const list = await post<ProviderHealth[]>('/api/connections/check');
      setHealth(new Map(list.map((p) => [p.id, p.health])));
    } catch (e) {
      fail(all.toast.checkFailed)(e);
    }
    setChecking(false);
  }

  function start(row?: ConnectionRow) {
    const preset = Object.keys(presets)[0] ?? '';
    const p = presets[preset];
    setForm(
      row
        ? {
            id: row.id,
            preset: '',
            name: row.name,
            baseUrl: row.baseUrl,
            key: '',
            models: row.models,
            cap: row.monthlyCapUsd ? String(row.monthlyCapUsd) : '',
          }
        : {
            id: '',
            preset,
            name: p?.name ?? '',
            baseUrl: p?.baseUrl ?? '',
            key: '',
            models: p?.models ?? { cheap: '', balanced: '', strong: '' },
            cap: '',
          },
    );
  }

  function pickPreset(preset: string) {
    const p = presets[preset];
    if (!p || !form) return;
    setForm({ ...form, preset, name: p.name, baseUrl: p.baseUrl, models: { ...p.models } });
  }

  async function save() {
    if (!form) return;
    try {
      await post('/api/connections', {
        id: form.id || undefined,
        preset: form.preset || undefined,
        name: form.name,
        baseUrl: form.baseUrl,
        models: form.models,
        key: form.key || undefined,
        monthlyCapUsd: form.cap ? Number(form.cap.replace(',', '.')) : undefined,
      });
      notify.success({
        title: all.toast.connectionSaved(form.name),
        description: all.toast.connectionSavedDetail,
      });
      setForm(null);
      router.refresh();
      void check();
    } catch (e) {
      fail(all.toast.connectionFailed)(e);
    }
  }

  async function remove(id: string) {
    try {
      await post(`/api/connections/${id}/remove`);
      setConfirming(null);
      notify.success({
        title: all.toast.connectionRemoved(initial.find((c) => c.id === id)?.name ?? id),
        description: all.toast.connectionRemovedDetail,
      });
      router.refresh();
    } catch (e) {
      fail(all.toast.connectionRemoveFailed)(e);
    }
  }

  const presetNeedsKey = form?.preset ? (presets[form.preset]?.key ?? true) : true;
  const editing = form?.id ? initial.find((c) => c.id === form.id) : undefined;

  return (
    <>
      <Block title={m.subscription}>
        <ul className="divide-y divide-white/6">
          {subscriptions.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-6 py-2.5">
              <span className="text-(--cb-highlight)">{p.name}</span>
              <span>{healthText(health.get(p.id), m)}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title={m.apis}>
        {initial.length === 0 && <p>{m.none}</p>}
        <ul className="divide-y divide-white/6">
          {initial.map((c) => (
            <li key={c.id} className="grid gap-2 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6">
                <span className="text-(--cb-highlight)">{c.name}</span>
                <span>{healthText(health.get(c.id), m)}</span>
              </div>
              <p className="break-all">{c.baseUrl}</p>
              <p>
                {ROLES.map((r) => `${m.roles[r]}: ${c.models[r]}`).join(' · ')}
                {c.billing === 'local' && ` · ${m.local}`}
                {c.monthlyCapUsd && ` · ${m.capOf(all.build.usd(c.monthlyCapUsd))}`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => start(c)}
                  className={SOFT}
                  aria-label={`${m.edit}: ${c.name}`}
                >
                  {m.edit}
                </button>
                <span className="flex-1" />
                {confirming === c.id ? (
                  <>
                    <span className="self-center">{m.confirmRemove(c.name)}</span>
                    <button type="button" onClick={() => void remove(c.id)} className={PRIMARY}>
                      {m.remove}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className={PLAIN}>
                      {m.cancel}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(c.id)}
                    className={PLAIN}
                    aria-label={`${m.remove}: ${c.name}`}
                  >
                    {m.remove}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          {!form && (
            <button type="button" onClick={() => start()} className={PRIMARY}>
              {m.add}
            </button>
          )}
          <button type="button" onClick={() => void check()} className={SOFT} disabled={checking}>
            {checking ? m.checking : m.check}
          </button>
        </div>

        {form && (
          <form
            aria-label={form.id ? `${m.edit}: ${form.name}` : m.add}
            className="mt-6 grid gap-3 rounded-[10px] p-4 shadow-[inset_0_0_0_1px_var(--cb-outline)]"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {!form.id && (
              <div className="relative rounded-[10px] bg-white/4 shadow-[inset_0_0_0_1px_var(--cb-outline)]">
                <select
                  id="conn-preset"
                  value={form.preset}
                  onChange={(e) => pickPreset(e.target.value)}
                  className="block h-14 w-full cursor-pointer appearance-none rounded-[10px] bg-transparent px-3.5 pt-5 text-(--cb-highlight) outline-none focus:shadow-[inset_0_0_0_1px_white]"
                >
                  {Object.entries(presets).map(([id, p]) => (
                    <option key={id} value={id} className="bg-[oklch(0.15_0.006_265)]">
                      {p.name}
                    </option>
                  ))}
                </select>
                <label
                  htmlFor="conn-preset"
                  className="pointer-events-none absolute top-[7px] left-3.5 text-[10px]"
                >
                  {m.preset}
                </label>
              </div>
            )}
            <Field
              id="conn-name"
              label={m.name}
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
            />
            <Field
              id="conn-url"
              label={m.address}
              value={form.baseUrl}
              onChange={(v) => setForm({ ...form, baseUrl: v })}
            />
            {(editing ? editing.needsKey : presetNeedsKey) && (
              <>
                <Field
                  id="conn-key"
                  label={m.key}
                  type="password"
                  autoComplete="new-password"
                  value={form.key}
                  onChange={(v) => setForm({ ...form, key: v })}
                />
                {editing?.hasKey && <p>{m.keyKept}</p>}
              </>
            )}
            <p className="mt-2 text-(--cb-highlight)">{m.models}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {ROLES.map((r) => (
                <Field
                  key={r}
                  id={`conn-model-${r}`}
                  label={m.roles[r]}
                  value={form.models[r]}
                  onChange={(v) => setForm({ ...form, models: { ...form.models, [r]: v } })}
                />
              ))}
            </div>
            <p>{m.modelsNote}</p>
            <Field
              id="conn-cap"
              label={m.cap}
              value={form.cap}
              onChange={(v) => setForm({ ...form, cap: v })}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="submit" className={PRIMARY}>
                {m.save}
              </button>
              <span className="flex-1" />
              <button type="button" onClick={() => setForm(null)} className={PLAIN}>
                {m.cancel}
              </button>
            </div>
          </form>
        )}
      </Block>
    </>
  );
}
