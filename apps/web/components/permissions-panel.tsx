'use client';

import { KeyRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Grant = 'view' | 'create' | 'update' | 'delete';
const GRANTS: Grant[] = ['view', 'create', 'update', 'delete'];
type Permission = { caller: string; collection: string; grants: Grant[] };
type Other = { id: string; name: string; color: string };

export type PermissionLabels = {
  button: string;
  title: string;
  note: string;
  grants: Record<Grant, string>;
  allowAnother: string;
  choose: string;
  revokeAll: string;
  nobody: string;
  noData: string;
  failed: string;
};

/**
 * The key at the top of a neuron's screen: who may ask what of it, by neuron and collection, and
 * the operations (View, Add, Change, Remove; those that write carry a dot). Only the owner changes
 * this, from this page; no application can reach it.
 */
export function PermissionsPanel({
  neuron,
  collections,
  others,
  initial,
  labels,
}: {
  neuron: string;
  collections: string[];
  others: Other[];
  initial: Permission[];
  labels: PermissionLabels;
}) {
  const [open, setOpen] = useState(false);
  const [perms, setPerms] = useState(initial);
  // Neurons added by "allow another" before any operation is on.
  const [added, setAdded] = useState<string[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  async function send(body: object) {
    setError(false);
    const res = await fetch(`/api/neurons/${neuron}/permissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) return setError(true);
    setPerms(await res.json());
  }

  const grantsOf = (caller: string, collection: string) =>
    perms.find((p) => p.caller === caller && p.collection === collection)?.grants ?? [];

  function toggle(caller: string, collection: string, grant: Grant) {
    const now = grantsOf(caller, collection);
    const grants = now.includes(grant) ? now.filter((g) => g !== grant) : [...now, grant];
    void send({ caller, collection, grants });
  }

  const callers = [...new Set([...perms.map((p) => p.caller), ...added])];
  const rows = callers.flatMap((id) => others.filter((o) => o.id === id));
  const free = others.filter((o) => !callers.includes(o.id));

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="permissions"
        aria-label={labels.button}
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/8 hover:text-white aria-expanded:bg-white/12 aria-expanded:text-white"
      >
        <KeyRound aria-hidden className="size-[18px]" strokeWidth={1.75} />
      </button>

      <section
        id="permissions"
        aria-label={labels.title}
        hidden={!open}
        className="absolute top-13 right-0 z-10 w-[min(24rem,calc(100vw-32px))] rounded-[10px] bg-[oklch(0.13_0.006_265/0.92)] p-4 shadow-[inset_0_0_0_1px_oklch(1_0_0/12%)] backdrop-blur-[14px]"
      >
        <h2 className="text-(--cb-highlight)">{labels.title}</h2>
        <p className="mt-0.5">{labels.note}</p>

        <div className="mt-4 grid max-h-[60dvh] gap-5 overflow-y-auto">
          {!collections.length && <p>{labels.noData}</p>}
          {collections.length > 0 && !rows.length && <p>{labels.nobody}</p>}
          {rows.map((o) => (
            <div key={o.id}>
              <div className="flex items-center gap-2 text-(--cb-highlight)">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ background: o.color, boxShadow: `0 0 8px ${o.color}` }}
                />
                {o.name}
              </div>
              {collections.map((c) => (
                <div
                  key={c}
                  role="group"
                  aria-label={`${o.name}: ${c}`}
                  className="mt-2 ml-3.5 flex flex-wrap items-center gap-1.5"
                >
                  <span className="w-full">{c}</span>
                  {GRANTS.map((g) => {
                    const on = grantsOf(o.id, c).includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(o.id, c, g)}
                        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 transition-colors ${on ? 'bg-white text-[oklch(0.15_0.006_265)]' : 'bg-white/8 hover:text-white'}`}
                      >
                        {labels.grants[g]}
                        {/* Operations that write carry a dot: more care before allowing them. */}
                        {g !== 'view' && (
                          <span aria-hidden className="size-1 rounded-full bg-current opacity-55" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
          {choosing && (
            <div role="group" aria-label={labels.choose} className="flex flex-wrap gap-1.5">
              <span className="w-full">{labels.choose}</span>
              {free.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setAdded((a) => [...a, o.id]);
                    setChoosing(false);
                  }}
                  className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full bg-white/8 px-3 hover:text-white"
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: o.color }}
                  />
                  {o.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-(--cb-highlight)">{labels.failed}</p>}

        {collections.length > 0 && (
          <div className="mt-4 flex justify-between gap-3">
            {free.length > 0 ? (
              <button
                type="button"
                onClick={() => setChoosing((v) => !v)}
                className="h-9 cursor-pointer rounded-full bg-white/8 px-4 hover:text-white"
              >
                {labels.allowAnother}
              </button>
            ) : (
              <span />
            )}
            {perms.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAdded([]);
                  void send({ revokeAll: true });
                }}
                className="h-9 cursor-pointer rounded-full px-3 hover:text-white"
              >
                {labels.revokeAll}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
