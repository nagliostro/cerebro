'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { t, type Locale } from '@/lib/i18n';

import { Field, PLAIN, post, PRIMARY, SOFT } from './settings-ui';

export type NeuronRow = {
  id: string;
  name: string;
  color: string;
  role: 'life' | 'craft';
  weight: number;
  built: boolean;
};

/**
 * The neurons, one per line: its point and name (opens it), role and weight; rename, change the
 * role, or remove for good, after a confirmation that says what goes away.
 */
export function NeuronsPanel({ initial, locale }: { initial: NeuronRow[]; locale: Locale }) {
  const all = t(locale);
  const m = all.settings.neurons;
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<NeuronRow | null>(null);
  const [note, setNote] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  const fail = (e: unknown) => setNote(all.settings.failed((e as Error).message));
  const change = (id: string, patch: Partial<NeuronRow>) =>
    setRows((r) => r.map((n) => (n.id === id ? { ...n, ...patch } : n)));

  async function rename(id: string) {
    if (!name.trim()) return;
    try {
      const n = await post<{ name: string }>(`/api/neurons/${id}/edit`, { name: name.trim() });
      change(id, { name: n.name });
      setRenaming(null);
      setNote('');
    } catch (e) {
      fail(e);
    }
  }

  async function role(id: string, value: 'life' | 'craft') {
    try {
      await post(`/api/neurons/${id}/edit`, { role: value });
      change(id, { role: value });
    } catch (e) {
      fail(e);
    }
  }

  function ask(n: NeuronRow) {
    setRemoving(n);
    dialog.current?.showModal();
  }

  async function remove() {
    const n = removing;
    if (!n) return;
    try {
      await post(`/api/neurons/${n.id}/remove`);
      setRows((r) => r.filter((x) => x.id !== n.id));
      setNote(m.removed(n.name));
      router.refresh();
    } catch (e) {
      fail(e);
    }
    dialog.current?.close();
  }

  return (
    <>
      <p role="status" className="mt-4 min-h-[1lh]">
        {note}
      </p>
      {rows.length === 0 ? (
        <p className="mt-6">{m.none}</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/6">
          {rows.map((n) => (
            <li key={n.id} className="grid gap-3 py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: n.color, boxShadow: `0 0 10px ${n.color}` }}
                />
                <Link href={`/neuron/${n.id}`} className="text-(--cb-highlight) hover:underline">
                  {n.name}
                </Link>
                <span>
                  {m.weight(n.weight)}
                  {!n.built && ` · ${m.noApp}`}
                </span>
              </div>

              {renaming === n.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-full sm:w-72">
                    <Field id={`name-${n.id}`} label={m.name} value={name} onChange={setName} />
                  </div>
                  <button type="button" onClick={() => void rename(n.id)} className={PRIMARY}>
                    {m.save}
                  </button>
                  <button type="button" onClick={() => setRenaming(null)} className={PLAIN}>
                    {m.cancel}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="radiogroup"
                    aria-label={`${m.role}: ${n.name}`}
                    className="flex rounded-full p-1 shadow-[inset_0_0_0_1px_var(--cb-outline)]"
                  >
                    {(['life', 'craft'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={n.role === r}
                        onClick={() => n.role !== r && void role(n.id, r)}
                        className={`h-9 cursor-pointer rounded-full px-3.5 ${
                          n.role === r
                            ? 'bg-white text-[oklch(0.15_0.006_265)]'
                            : 'hover:text-(--cb-highlight)'
                        }`}
                      >
                        {all.build.role[r]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setName(n.name);
                      setRenaming(n.id);
                    }}
                    className={SOFT}
                    aria-label={`${m.rename}: ${n.name}`}
                  >
                    {m.rename}
                  </button>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => ask(n)}
                    className={PLAIN}
                    aria-label={`${m.remove}: ${n.name}`}
                  >
                    {m.remove}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialog}
        aria-labelledby="remove-title"
        onClose={() => setRemoving(null)}
        className="m-auto w-[min(100%-32px,26rem)] rounded-[10px] bg-[oklch(0.13_0.006_265/0.96)] p-6 text-(--cb-text) shadow-[inset_0_0_0_1px_var(--cb-outline)] backdrop:bg-black/60"
      >
        <h2 id="remove-title" className="text-(--cb-highlight)">
          {removing ? m.confirmTitle(removing.name) : ''}
        </h2>
        <p className="mt-2">{m.confirmText}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => void remove()} className={PRIMARY}>
            {m.confirm}
          </button>
          <span className="flex-1" />
          <button type="button" onClick={() => dialog.current?.close()} className={PLAIN}>
            {m.cancel}
          </button>
        </div>
      </dialog>
    </>
  );
}
