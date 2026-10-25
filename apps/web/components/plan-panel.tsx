'use client';

import type { Estimate } from '@cerebro/dominus/plan';
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState } from 'react';

import type { Locale, Messages } from '@/lib/i18n';

import type { PlanView } from './construction';

type Other = { id: string; name: string; color: string };

const PILL = 'inline-flex h-11 cursor-pointer items-center rounded-full px-5 transition-colors';
const PRIMARY = `${PILL} bg-white text-[oklch(0.15_0.006_265)]`;
const SOFT = `${PILL} bg-white/8 hover:text-white`;
const PLAIN = `${PILL} px-3 hover:text-white`;

/** The cost of building, as the Guard sees it, in the owner's words. */
export function estimateLine(
  e: Estimate | null,
  m: Messages['build'],
  windows: Messages['window'],
  locale: Locale,
) {
  if (!e || e.verdict === 'none-ready') return { text: m.estimate.noAi, cost: false };
  if (e.costUsd === null) return { text: m.estimate.unknown, cost: true };
  const cost = m.usd(e.costUsd);
  const window = windows[(e.window ?? 'session') as keyof typeof windows] ?? e.window ?? '';
  const time = e.until
    ? new Date(e.until).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const share = e.share !== null ? m.percent(e.share) : '';
  const head =
    e.verdict === 'fits' && share
      ? m.estimate.fits(cost, window, share)
      : e.verdict === 'tight' && share
        ? m.estimate.tight(cost, window, share)
        : e.verdict === 'wait'
          ? m.estimate.wait(cost, window, time)
          : m.estimate.cost(cost);
  return { text: `${head}, ${m.estimate.basis(e.basis)}`, cost: true };
}

/** A floating-label field, the same as everywhere in the Cerebro. */
function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative w-full rounded-[10px] bg-white/4 shadow-[inset_0_0_0_1px_var(--cb-outline)]">
      <textarea
        id={id}
        rows={2}
        value={value}
        placeholder=" "
        maxLength={4000}
        onChange={(e) => onChange(e.target.value)}
        className="peer block w-full resize-none rounded-[10px] bg-transparent px-3.5 pt-6 pb-2 text-(--cb-highlight) outline-none focus:shadow-[inset_0_0_0_1px_white]"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute top-[17px] left-3.5 transition-all duration-200 peer-focus:top-[7px] peer-focus:text-[10px] peer-[:not(:placeholder-shown)]:top-[7px] peer-[:not(:placeholder-shown)]:text-[10px]"
      >
        {label}
      </label>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-(--cb-highlight)">{title}</h3>
      {children}
    </div>
  );
}

function Numbered({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="grid gap-1">
      {items.map((item, i) => (
        <li key={i} className="grid grid-cols-[28px_1fr]">
          <span className="opacity-70">{String(i + 1).padStart(2, '0')}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The plan, in one transparent layer: what the Dominus understood, what it will make, the data,
 * the links to other neurons, how to tell it works and, always in sight at the foot, the cost in
 * gold. With details missing, the questions and a field to answer them.
 */
export function PlanPanel({
  plan,
  others,
  m,
  windows,
  locale,
  onAnswer,
  onAccept,
  onReject,
  onAdjust,
}: {
  plan: PlanView;
  others: Other[];
  m: Messages['build'];
  windows: Messages['window'];
  locale: Locale;
  onAnswer: (text: string) => Promise<boolean>;
  onAccept: () => void;
  onReject: () => void;
  /** The plan says an existing neuron already does this: adjust that one instead. */
  onAdjust: (neuron: string) => void;
}) {
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState('');
  const primary = useRef<HTMLButtonElement>(null);
  const p = plan.plan!;
  const asking = plan.status === 'questions';
  const adjusting = !!plan.target;
  const nameOf = (id: string) => others.find((o) => o.id === id);
  // Nothing new to make: an existing neuron is the place for it.
  const elsewhere = !asking && !!p.existing && !p.creates.length ? nameOf(p.existing!) : undefined;

  // The main action takes the focus when the plan arrives, so the keyboard is already there.
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, [plan.id, plan.status, changing]);

  async function send() {
    if (text.trim() && (await onAnswer(text.trim()))) {
      setText('');
      setChanging(false);
    }
  }

  const estimate = estimateLine(plan.estimate, m, windows, locale);

  return (
    <section
      aria-label={m.plan}
      className="fixed inset-x-2 bottom-2 z-50 flex max-h-[78dvh] animate-[cb-pop_0.3s_cubic-bezier(0.2,0,0,1)] flex-col rounded-[10px] bg-[oklch(0.13_0.006_265/0.55)] shadow-[inset_0_0_0_1px_var(--cb-outline)] backdrop-blur-md min-[820px]:left-1/2 min-[820px]:w-[40rem] min-[820px]:-translate-x-1/2 xl:top-6 xl:right-6 xl:bottom-6 xl:left-auto xl:max-h-none xl:w-96 xl:translate-x-0"
    >
      <div className="grid flex-1 [scrollbar-width:thin] [scrollbar-color:oklch(1_0_0/16%)_transparent] content-start gap-[18px] overflow-y-auto px-5 pt-5 pb-2 [mask:linear-gradient(#000_calc(100%-28px),transparent)]">
        <div className="flex items-center gap-2.5">
          {asking ? (
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full shadow-[inset_0_0_0_1px_white]"
            />
          ) : (
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: plan.color ?? 'white', boxShadow: `0 0 10px ${plan.color}` }}
            />
          )}
          <h2 className="text-(--cb-highlight)">{asking ? m.questionsTitle : p.name}</h2>
          {!asking && <span>· {m.role[p.role]}</span>}
        </div>
        <p>“{plan.request}”</p>
        {plan.exchanges.map((e, i) => (
          <p key={i}>{m.said(e.text)}</p>
        ))}

        {asking ? (
          <Section title={m.questionsLead}>
            <Numbered
              items={p.questions.map((q) => (
                <span key={q} className="text-(--cb-highlight)">
                  {q}
                </span>
              ))}
            />
          </Section>
        ) : (
          <>
            {p.existing && nameOf(p.existing) && (
              <p>
                {m.existing(nameOf(p.existing)!.name)}{' '}
                <Link href={`/neuron/${p.existing}`} className="text-(--cb-highlight) underline">
                  {m.open(nameOf(p.existing)!.name)}
                </Link>
              </p>
            )}
            <Section title={m.understood}>
              <p>{p.understood}</p>
            </Section>
            {!elsewhere && (
              <Section title={adjusting ? m.changesList : m.creates}>
                <Numbered
                  items={p.creates.map((c) => (
                    <Fragment key={c.name}>
                      <span className="text-(--cb-highlight)">{c.name}</span>
                      {c.what && ` · ${c.what}`}
                    </Fragment>
                  ))}
                />
              </Section>
            )}
            {p.collections.length > 0 && (
              <Section title={m.data}>
                <div className="grid grid-cols-[auto_1fr] gap-x-2.5">
                  {p.collections.map((c) => (
                    <div key={c.name} className="contents">
                      <span className="text-(--cb-highlight)">{c.name}</span>
                      <span>{c.fields.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
            {p.links.length > 0 && (
              <Section title={m.links}>
                {p.links.map((l) => {
                  const o = nameOf(l.neuron);
                  return (
                    <p key={`${l.neuron}.${l.collection}`}>
                      <span
                        aria-hidden
                        className="mr-1.5 inline-block size-1.5 rounded-full align-[1px]"
                        style={{ background: o?.color }}
                      />
                      <span className="text-(--cb-highlight)">{m.reads(o?.name ?? l.neuron)}</span>{' '}
                      · {l.collection}: {l.why}
                    </p>
                  );
                })}
                <p>{m.linksNote(p.name)}</p>
              </Section>
            )}
            {p.checks.length > 0 && (
              <Section title={m.checks}>
                <Numbered items={p.checks} />
              </Section>
            )}
            {p.limits.length > 0 && (
              <Section title={m.limits}>
                {p.limits.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </Section>
            )}
          </>
        )}
        <p className="text-(--cb-cost)">{m.thinkCost(m.usd(plan.thinkCostUsd))}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 pt-3 pb-5">
        {asking || changing ? (
          <>
            <Field
              id="plan-answer"
              label={asking ? m.answers : m.changes}
              value={text}
              onChange={setText}
            />
            <button ref={primary} type="button" onClick={send} className={PRIMARY}>
              {asking ? m.reply : m.redo}
            </button>
            <span className="flex-1" />
            {changing ? (
              <button type="button" onClick={() => setChanging(false)} className={PLAIN}>
                {m.back}
              </button>
            ) : (
              <button type="button" onClick={onReject} className={PLAIN}>
                {m.reject}
              </button>
            )}
          </>
        ) : elsewhere ? (
          <>
            <button
              ref={primary}
              type="button"
              onClick={() => onAdjust(elsewhere.id)}
              className={PRIMARY}
            >
              {m.adjustExisting(elsewhere.name)}
            </button>
            <button
              type="button"
              onClick={() => void onAnswer(m.createAnywayText(elsewhere.name))}
              className={SOFT}
            >
              {m.createAnyway}
            </button>
            <span className="flex-1" />
            <button type="button" onClick={onReject} className={PLAIN}>
              {m.reject}
            </button>
          </>
        ) : (
          <>
            <p className={`w-full ${estimate.cost ? 'text-(--cb-cost)' : ''}`}>{estimate.text}</p>
            <button ref={primary} type="button" onClick={onAccept} className={PRIMARY}>
              {adjusting ? m.acceptAdjust : m.accept}
            </button>
            <button type="button" onClick={() => setChanging(true)} className={SOFT}>
              {m.change}
            </button>
            <span className="flex-1" />
            <button type="button" onClick={onReject} className={PLAIN}>
              {m.reject}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
