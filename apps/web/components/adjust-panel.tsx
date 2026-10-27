'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { t, type Locale } from '@/lib/i18n';

const noChange = () => () => {};

type Entry = {
  id: string;
  request: string;
  status: string;
  adjusting: boolean;
  createdAt: number;
  thinkCostUsd: number;
  buildCostUsd: number | null;
  error: string | null;
  exchanges?: { kind: string; text: string }[];
  plan?: { understood: string } | null;
};

/** One turn of the conversation: what the owner said, and what the neuron answered. */
type Turn = {
  id: string;
  said: string[];
  reply: string | null;
  at: number | null;
  costUsd: number;
  /** How it was answered: by a plan built, directly, or by code alone. */
  how: 'plan' | 'direct' | 'noAi';
  undo: boolean;
};

/**
 * The conversation with a neuron, opened by the pencil, in the plan's place (the right side on a
 * wide screen, a sheet from below on a phone). As in the chat apps people know (ChatGPT, Claude,
 * Gemini): what the owner said on the right in a soft bubble, what the neuron says on the left as
 * plain text, after its dot. Each request already made is a turn (Undo on the last adjustment);
 * the work going on now is the neuron's last word; the box asks for the next one. With ?demo, a
 * sample conversation shows the kinds of answer still to come (direct, without AI).
 */
export function AdjustPanel({
  neuron,
  name,
  color,
  locale,
  live,
  liveId,
  box,
  refresh,
  onUndo,
  onClose,
}: {
  neuron: string;
  name: string;
  /** The neuron's color: its dot before each of its answers. */
  color: string;
  locale: Locale;
  /** What is going on now (the steps, the countdown, how it ended). */
  live: React.ReactNode;
  /** The request it is about: its turn takes the live word as its answer, never both. */
  liveId?: string;
  /** The Dominus box, docked here, with the name inside its field. */
  box: (label: string) => React.ReactNode;
  /** Changes when a plan moves on, so the list is read again. */
  refresh: string;
  onUndo: (plan: string) => void;
  onClose: () => void;
}) {
  const all = t(locale);
  const m = all.adjust;
  const [entries, setEntries] = useState<Entry[]>([]);
  // The sample conversation, by the address (?demo); none while the server draws the page.
  const demo = useSyncExternalStore(
    noChange,
    () => new URLSearchParams(window.location.search).has('demo'),
    () => false,
  );
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let gone = false;
    void fetch(`/api/plans/history?neuron=${neuron}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Entry[]) => !gone && setEntries(list));
    return () => {
      gone = true;
    };
  }, [neuron, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !live && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, onClose]);

  // Only the newest adjustment can be undone, and only once.
  const undoable = entries.find((e) => e.status === 'built' || e.status === 'undone');
  const replyOf = (e: Entry): string | null => {
    // A sentence of its own, after the neuron's first words.
    const u = e.plan?.understood ?? '';
    const understood = u.charAt(0).toLocaleUpperCase(locale) + u.slice(1);
    if (e.status === 'built')
      return e.adjusting ? m.reply.adjusted(understood) : m.reply.built(understood);
    if (e.status in m.reply) return m.reply[e.status as keyof typeof m.reply] as string;
    // Still in the owner's hands or at work: its word is the live one, below.
    return null;
  };
  const turns: Turn[] = demo
    ? m.demoThread.map((d, i) => ({
        id: `demo-${i}`,
        said: [d.ask],
        reply: d.answer,
        at: null,
        costUsd: d.cost,
        how: d.how === 'adjusted' ? 'plan' : (d.how as Turn['how']),
        undo: false,
      }))
    : [...entries].reverse().map((e) => ({
        id: e.id,
        said: [e.request, ...(e.exchanges ?? []).map((x) => x.text)],
        reply: live && e.id === liveId ? null : replyOf(e),
        at: e.createdAt,
        costUsd: e.thinkCostUsd + (e.buildCostUsd ?? 0),
        how: 'plan',
        undo: undoable?.id === e.id && e.status === 'built' && e.adjusting,
      }));

  // The newest word in view, as in any conversation.
  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, live]);

  const when = (ms: number) =>
    new Date(ms).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  const dot = (
    <span
      aria-hidden
      className="mt-[7px] size-1.5 shrink-0 rounded-full"
      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
    />
  );

  return (
    <section
      data-avoid
      aria-label={m.title(name)}
      className="fixed inset-x-2 bottom-2 z-50 flex max-h-[78dvh] animate-[cb-pop_0.3s_cubic-bezier(0.2,0,0,1)] flex-col rounded-[10px] bg-[oklch(0.13_0.006_265/0.72)] shadow-[inset_0_0_0_1px_var(--cb-outline)] backdrop-blur-md min-[820px]:left-1/2 min-[820px]:w-[40rem] min-[820px]:-translate-x-1/2 xl:top-[84px] xl:right-6 xl:bottom-6 xl:left-auto xl:max-h-none xl:w-96 xl:translate-x-0"
    >
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <h2 className="flex items-center gap-2.5 text-(--cb-highlight)">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 10px ${color}` }}
          />
          {name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={m.close}
          className="grid size-11 cursor-pointer place-items-center rounded-full hover:text-(--cb-highlight)"
        >
          <X aria-hidden className="size-[18px]" strokeWidth={1.75} />
        </button>
      </div>
      <div
        ref={thread}
        className="grid min-h-0 flex-1 [scrollbar-width:thin] grid-cols-[minmax(0,1fr)] content-start gap-5 overflow-x-hidden overflow-y-auto px-5 pt-3 pb-4 [overflow-wrap:anywhere]"
      >
        {demo && <p className="text-center text-(--cb-cost)">{m.demo}</p>}
        {!turns.length && !live && (
          <p className="flex gap-2.5">
            {dot}
            <span>{m.hello(name)}</span>
          </p>
        )}
        <ol className="grid gap-5">
          {turns.map((turn) => (
            <li key={turn.id} className="grid gap-2.5">
              {turn.said.map((s, i) => (
                <p
                  key={i}
                  className="ml-auto max-w-[85%] rounded-[14px] bg-white/8 px-3.5 py-2 text-(--cb-highlight)"
                >
                  {s}
                </p>
              ))}
              {turn.reply && (
                <div className="flex gap-2.5">
                  {dot}
                  <div className="grid min-w-0 gap-1">
                    <p className="text-(--cb-highlight)">{turn.reply}</p>
                    <p>
                      {[
                        turn.at ? when(turn.at) : null,
                        turn.how === 'direct' ? m.direct : turn.how === 'noAi' ? m.noAi : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {turn.costUsd > 0 && (
                        <span className="text-(--cb-cost)">
                          {turn.at || turn.how !== 'plan' ? ' · ' : ''}
                          {all.build.usd(turn.costUsd)}
                        </span>
                      )}
                    </p>
                    {turn.undo && (
                      <button
                        type="button"
                        onClick={() => onUndo(turn.id)}
                        className="mt-1 inline-flex h-11 w-fit cursor-pointer items-center rounded-full bg-white/8 px-5 hover:text-white"
                      >
                        {all.build.undo}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
        {live && (
          <div role="status" aria-live="polite" className="flex gap-2.5">
            {dot}
            <div className="grid min-w-0 justify-items-start gap-1.5">{live}</div>
          </div>
        )}
      </div>
      {/* "Talk to" once a question gets a direct answer (phase 4); until then, a change. */}
      <div className="px-3 pt-1 pb-3">{box(demo ? m.talk(name) : all.build.askAdjust(name))}</div>
    </section>
  );
}
