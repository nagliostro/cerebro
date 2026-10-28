'use client';

import type { Estimate, PlanRow } from '@cerebro/dominus/plan';
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState } from 'react';

import type { Locale, Messages } from '@/lib/i18n';

import type { PlanView } from './construction';
import { DominusBox } from './dominus-box';
import { ScreenMock } from './screen-mock';
import { BTN_PLAIN, BTN_PRIMARY, BTN_SOFT, choiceBox, choiceMark } from './button';

type Other = { id: string; name: string; color: string };

const PRIMARY = BTN_PRIMARY;
const SOFT = BTN_SOFT;
const PLAIN = BTN_PLAIN;

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-(--cb-highlight)">{title}</h3>
      {children}
    </div>
  );
}

type Research = NonNullable<PlanRow['research']>;
type Tool = NonNullable<NonNullable<PlanRow['plan']>['tool']>;

const mb = (bytes: number, locale: Locale) =>
  `${(bytes / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;

/** Production: the program to install, pinned (release, file, checksum), and how it is done. */
function ToolPlan({ tool, m, locale }: { tool: Tool; m: Messages['build']; locale: Locale }) {
  const date = new Date(`${tool.date}T12:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (
    <>
      <Section title={m.toolWhat}>
        <p>{m.toolRelease(tool.tag, date)}</p>
        <p>
          <a
            href={tool.asset.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--cb-highlight) underline decoration-white/25 underline-offset-[3px]"
          >
            {tool.asset.name}
          </a>{' '}
          · {m.toolFile(mb(tool.asset.bytes, locale), tool.system)}
        </p>
        <p>{m.toolLicense(tool.license)}</p>
        <p>{m.toolChecksum(tool.checksum, tool.sha256.slice(0, 16))}</p>
        <p className="mt-1.5">{m.toolWhere}</p>
      </Section>
      <Section title={m.toolHow}>
        <Numbered items={m.toolSteps} />
      </Section>
    </>
  );
}

/** Where a rule or finding came from: a link to it (by its site), or the original itself. */
function Source({ source, observed }: { source: string; observed: string }) {
  if (source === 'observed') return <>{observed}</>;
  let host = source;
  try {
    host = new URL(source).hostname.replace(/^www\./, '');
  } catch {
    // Shown as it is.
  }
  return (
    <a
      href={source}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-white/25 underline-offset-[3px] hover:text-(--cb-highlight)"
    >
      {host}
    </a>
  );
}

/** The answer key as a table: inputs, then outputs (in white); the first four, the rest on demand. */
function Cases({ cases, more }: { cases: Research['cases']; more: string }) {
  const inputs = [...new Set(cases.flatMap((c) => Object.keys(c.input)))];
  const outputs = [...new Set(cases.flatMap((c) => Object.keys(c.output)))];
  const row = (c: Research['cases'][number], i: number) => (
    <tr key={i} className="border-t border-white/6">
      {inputs.map((k, j) => (
        <td key={k} className={`py-[3px] align-top ${j ? 'text-right' : 'text-left'}`}>
          {c.input[k] ?? ''}
        </td>
      ))}
      {outputs.map((k) => (
        <td key={k} className="py-[3px] text-right align-top text-(--cb-highlight)">
          {c.output[k] ?? ''}
        </td>
      ))}
    </tr>
  );
  const head = (
    <thead>
      <tr>
        {[...inputs, ...outputs].map((k, j) => (
          <th key={k} className={`pb-1 font-[inherit] ${j ? 'text-right' : 'text-left'}`}>
            {k}
          </th>
        ))}
      </tr>
    </thead>
  );
  return (
    <>
      <table className="w-full table-fixed border-collapse tabular-nums">
        {head}
        <tbody>{cases.slice(0, 4).map(row)}</tbody>
      </table>
      {cases.length > 4 && (
        <details className="group">
          <summary className="w-fit cursor-pointer list-none py-1.5 group-open:hidden hover:text-(--cb-highlight) [&::-webkit-details-marker]:hidden">
            {more}
          </summary>
          <table className="w-full table-fixed border-collapse tabular-nums">
            <tbody>{cases.slice(4).map((c, i) => row(c, i + 4))}</tbody>
          </table>
        </details>
      )}
    </>
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
  embedded = false,
}: {
  plan: PlanView;
  others: Other[];
  m: Messages['build'];
  windows: Messages['window'];
  locale: Locale;
  onAnswer: (text: string, files?: File[]) => Promise<boolean>;
  /** Build, with the improvements of the research the owner ticked (their order). */
  onAccept: (improvements: number[]) => void;
  onReject: () => void;
  /** The plan says an existing neuron already does this: adjust that one instead. */
  onAdjust: (neuron: string) => void;
  /**
   * In a neuron's conversation: inside the thread, under what the owner said (so not said again),
   * and answered or changed in the conversation's own box (so none of its own).
   */
  embedded?: boolean;
}) {
  const [changing, setChanging] = useState(false);
  const [choice, setChoice] = useState(0);
  const [chosen, setChosen] = useState<number[]>([]);
  const choices = useRef<(HTMLButtonElement | null)[]>([]);
  const primary = useRef<HTMLButtonElement>(null);
  const p = plan.plan!;
  const asking = plan.status === 'questions';
  // The research asked which feature: its options, as one choice.
  const options = asking ? (p.options ?? []) : [];
  // A GitHub repository: what it is, and what to make of it (production or application).
  const repo = asking ? p.repo : undefined;
  // Production: the program to install, pinned; nothing in it to change.
  const tool = !asking ? p.tool : undefined;
  const kindOf = (o: string) => m.repoKinds[o as keyof typeof m.repoKinds];
  const r = plan.research?.feature ? plan.research : null;
  const adjusting = !!plan.target;
  const nameOf = (id: string) => others.find((o) => o.id === id);
  // Nothing new to make: an existing neuron is the place for it.
  const elsewhere = !asking && !!p.existing && !p.creates.length ? nameOf(p.existing!) : undefined;

  // The main action takes the focus when the plan arrives, so the keyboard is already there.
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, [plan.id, plan.status, changing]);

  async function send(text: string, files: File[]) {
    if (!(await onAnswer(text, files))) return false;
    setChanging(false);
    return true;
  }

  const estimate = estimateLine(plan.estimate, m, windows, locale);

  return (
    <section
      data-avoid={embedded ? undefined : true}
      aria-label={m.plan}
      className={
        embedded
          ? 'grid w-full min-w-0 rounded-[10px] shadow-[inset_0_0_0_1px_var(--cb-outline)]'
          : `fixed inset-x-2 bottom-2 z-50 flex max-h-[78dvh] animate-[cb-pop_0.3s_cubic-bezier(0.2,0,0,1)] flex-col rounded-[10px] bg-[oklch(0.13_0.006_265/0.55)] shadow-[inset_0_0_0_1px_var(--cb-outline)] backdrop-blur-md min-[820px]:left-1/2 min-[820px]:w-[40rem] min-[820px]:-translate-x-1/2 xl:top-6 xl:right-6 xl:bottom-6 xl:left-auto xl:max-h-none xl:w-96 xl:translate-x-0`
      }
    >
      {/* One column that never grows past the panel: long words (links, names, values) break
          inside it, and only the vertical scroll is left. */}
      <div
        className={
          embedded
            ? 'grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-[18px] px-4 pt-4 pb-1 [overflow-wrap:anywhere]'
            : `grid min-w-0 flex-1 [scrollbar-width:thin] [scrollbar-color:oklch(1_0_0/16%)_transparent] grid-cols-[minmax(0,1fr)] content-start gap-[18px] overflow-x-hidden overflow-y-auto px-5 pt-5 pb-2 [overflow-wrap:anywhere] [mask:linear-gradient(#000_calc(100%-28px),transparent)]`
        }
      >
        {/* In the conversation the neuron is already named: only questions get a title. */}
        <div className={`flex items-center gap-2.5 ${embedded && !asking ? 'hidden' : ''}`}>
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
          <h2 className="text-(--cb-highlight)">
            {repo
              ? m.repoTitle
              : options.length
                ? m.chooseTitle
                : asking
                  ? m.questionsTitle
                  : p.name}
          </h2>
          {!asking && <span>· {m.role[p.role]}</span>}
        </div>
        {!embedded && (
          <>
            <p>“{plan.request}”</p>
            {plan.exchanges.map((e, i) => (
              <p key={i}>{m.said(e.text)}</p>
            ))}
          </>
        )}

        {repo && (
          <Section title={repo.full}>
            <p>{repo.summary}</p>
            <p className="mt-1.5">
              {[
                repo.language,
                repo.license,
                m.repoStars(repo.stars.toLocaleString(locale)),
                repo.release ? m.repoRelease(repo.release) : m.repoNoRelease,
              ]
                .filter(Boolean)
                .join(' · ')}{' '}
              ·{' '}
              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-(--cb-highlight) underline"
              >
                GitHub
              </a>
            </p>
            {!repo.free && <p className="mt-1.5">{m.repoNotFree}</p>}
            {repo.archived && <p className="mt-1.5">{m.repoArchived}</p>}
          </Section>
        )}
        {options.length ? (
          <Section title={repo ? m.repoLead : m.chooseLead(options.length)}>
            {/* Choice boxes, not buttons: a feature's name is a sentence, never cut. */}
            <div
              role="radiogroup"
              aria-label={repo ? m.repoTitle : m.chooseTitle}
              className="grid gap-2"
            >
              {options.map((o, i) => (
                <button
                  key={o}
                  ref={(el) => {
                    choices.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={choice === i}
                  tabIndex={choice === i ? 0 : -1}
                  onClick={() => setChoice(i)}
                  onKeyDown={(e) => {
                    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
                    if (!d) return;
                    e.preventDefault();
                    const n = (i + d + options.length) % options.length;
                    setChoice(n);
                    choices.current[n]?.focus();
                  }}
                  className={choiceBox(choice === i)}
                >
                  <span aria-hidden className={choiceMark(choice === i)}>
                    {choice === i && <span className="size-2 rounded-full bg-white" />}
                  </span>
                  {repo ? (
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-(--cb-highlight)">{kindOf(o).label}</span>
                      <span>{kindOf(o).detail}</span>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1">{o}</span>
                  )}
                </button>
              ))}
            </div>
            {!repo && <p className="mt-1.5">{m.chooseNote}</p>}
          </Section>
        ) : asking ? (
          <Section title={m.questionsLead}>
            <Numbered
              items={p.questions.map((q) => (
                <span key={q} className="text-(--cb-highlight)">
                  {q}
                </span>
              ))}
            />
          </Section>
        ) : tool ? (
          <>
            <Section title={m.understood}>
              <p>{p.understood}</p>
              {p.repo && (
                <p className="mt-1.5">
                  <a
                    href={p.repo.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-(--cb-highlight) underline"
                  >
                    {p.repo.full}
                  </a>
                  {p.repo.archived && ` · ${m.repoArchived}`}
                </p>
              )}
            </Section>
            <ToolPlan tool={tool} m={m} locale={locale} />
          </>
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
            {r && (
              <>
                <Section title={m.observed}>
                  {r.screenshot && (
                    // eslint-disable-next-line @next/next/no-img-element -- a private file of this plan
                    <img
                      src={`/api/plans/${plan.id}/screenshot`}
                      alt={m.shot}
                      className="mb-2 aspect-[16/10] w-full rounded-lg object-cover object-top shadow-[inset_0_0_0_1px_var(--cb-outline)]"
                    />
                  )}
                  <div className="grid grid-cols-[auto_1fr] gap-x-2.5">
                    {r.fields.length > 0 && (
                      <>
                        <span className="text-(--cb-highlight)">{m.fields}</span>
                        <span>{r.fields.map((f) => `${f.name} (${f.detail})`).join(', ')}</span>
                      </>
                    )}
                    {r.outputs.length > 0 && (
                      <>
                        <span className="text-(--cb-highlight)">{m.outputs}</span>
                        <span>{r.outputs.map((f) => `${f.name} (${f.detail})`).join(', ')}</span>
                      </>
                    )}
                    {r.server && (
                      <>
                        <span className="text-(--cb-highlight)">{m.server}</span>
                        <span>{r.server}</span>
                      </>
                    )}
                  </div>
                </Section>
                {(r.screen?.length ?? 0) > 0 && (
                  <Section title={m.screen}>
                    <ScreenMock
                      items={r.screen}
                      color={plan.color ?? 'oklch(0.78 0.11 160)'}
                      pair={{ value: m.mockValue, choice: m.mockChoice }}
                      label={m.screen}
                      openLabel={m.screenOpen}
                      closeLabel={m.close}
                    />
                    <p className="mt-1.5">{m.screenNote}</p>
                  </Section>
                )}
                {(r.sources?.length ?? 0) > 0 && (
                  <Section title={m.dataSources}>
                    {r.sources.map((s) => (
                      <p key={s.host}>
                        <span className="text-(--cb-highlight)">{s.data}</span> ·{' '}
                        {m.sourceLine(s.host, s.updates)}
                        <br />
                        {m.sourceOriginal(s.original)}
                      </p>
                    ))}
                  </Section>
                )}
                {r.cases.length > 0 && (
                  <Section title={m.answerKey(r.cases.length)}>
                    <Cases cases={r.cases} more={m.showCases(r.cases.length)} />
                    <p className="mt-1.5">
                      {m.answerKeyNote(
                        r.cases.filter((c) => c.source === 'observed').length,
                        r.cases.filter((c) => c.source !== 'observed').length,
                      )}
                    </p>
                  </Section>
                )}
                {r.rules.length > 0 && (
                  <Section title={m.rulesFound}>
                    <Numbered
                      items={r.rules.map((x) => (
                        <Fragment key={x.text}>
                          {x.text} · <Source source={x.source} observed={m.observedSource} />
                        </Fragment>
                      ))}
                    />
                  </Section>
                )}
                {(r.improvements.length > 0 || r.defects.length > 0) && (
                  <Section title={m.improvements}>
                    {r.improvements.map((x, i) => (
                      <label
                        key={x.text}
                        className="grid cursor-pointer grid-cols-[24px_1fr] py-0.5 hover:text-(--cb-highlight)"
                      >
                        <input
                          type="checkbox"
                          checked={chosen.includes(i)}
                          onChange={(e) =>
                            setChosen((c) =>
                              e.target.checked ? [...c, i] : c.filter((n) => n !== i),
                            )
                          }
                          className="mt-[3px] size-3.5 cursor-pointer accent-white"
                        />
                        <span>
                          {x.text} · <Source source={x.source} observed={m.observedSource} />
                        </span>
                      </label>
                    ))}
                    {r.defects.map((x) => (
                      <p key={x.text} className="mt-1.5">
                        {m.defect} {x.text} ·{' '}
                        <Source source={x.source} observed={m.observedSource} />
                      </p>
                    ))}
                  </Section>
                )}
                {r.gaps.length > 0 && (
                  <Section title={m.gaps}>
                    {r.gaps.map((g) => (
                      <p key={g}>{g}</p>
                    ))}
                  </Section>
                )}
              </>
            )}
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
            {p.internet?.length > 0 && (
              <Section title={m.internet}>
                <div className="grid grid-cols-[auto_1fr] gap-x-2.5">
                  {p.internet.map((s) => (
                    <div key={s.host} className="contents">
                      <span className="text-(--cb-highlight)">{s.host}</span>
                      <span>{s.why}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5">{m.internetNote(p.name)}</p>
              </Section>
            )}
            {p.libraries?.length > 0 && (
              <Section title={m.libraries}>
                {p.libraries.map((l) => (
                  <p key={l.name}>
                    <a
                      href={`https://www.npmjs.com/package/${l.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-(--cb-highlight) underline decoration-white/25 underline-offset-[3px]"
                    >
                      {l.name}
                    </a>{' '}
                    · {m.library(l.version, l.license, l.weekly.toLocaleString(locale))}
                    {l.why && ` · ${l.why}`}
                  </p>
                ))}
                <p className="mt-1.5">{m.librariesNote}</p>
              </Section>
            )}
            {r && r.sites.length > 0 && (
              <Section title={m.sites}>
                <div className="grid grid-cols-[auto_1fr] gap-x-2.5">
                  {r.sites.map((site) => (
                    <div key={site.host} className="contents">
                      <span className="text-(--cb-highlight)">{site.host}</span>
                      <span>{m.pages(site.pages)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5">{m.sitesNote}</p>
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
        <p className="text-(--cb-cost)">
          {(plan.research ? m.researchCost : m.thinkCost)(m.usd(plan.thinkCostUsd))}
        </p>
      </div>

      <div
        className={`flex flex-wrap items-center gap-2 ${embedded ? 'px-4 pt-3 pb-4' : 'px-5 pt-3 pb-5'}`}
      >
        {options.length ? (
          <>
            <button
              ref={primary}
              type="button"
              onClick={() =>
                void onAnswer(repo ? kindOf(options[choice]!).label : options[choice]!)
              }
              className={PRIMARY}
            >
              {repo ? m.repoGo : m.researchThis}
            </button>
            <span className="flex-1" />
            <button type="button" onClick={onReject} className={PLAIN}>
              {m.reject}
            </button>
          </>
        ) : embedded && asking ? (
          // Answered in the conversation's box, below.
          <button type="button" onClick={onReject} className={PLAIN}>
            {m.reject}
          </button>
        ) : asking || changing ? (
          <>
            {/* The same box as the Dominus's: only what it is about changes. */}
            <DominusBox
              docked
              autoFocus={changing}
              label={asking ? m.answers : m.changes}
              sendLabel={asking ? m.reply : m.redo}
              stopLabel={m.stop}
              attachLabel={m.attach}
              removeLabel={m.removeAttachment}
              tooMany={{ title: m.attachRefused, description: m.attachLimits }}
              busy={false}
              onSend={send}
              onStop={() => undefined}
            />
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
        ) : tool ? (
          <>
            <p className="w-full">{m.toolNoAi}</p>
            <button ref={primary} type="button" onClick={() => onAccept([])} className={PRIMARY}>
              {m.install}
            </button>
            <span className="flex-1" />
            <button type="button" onClick={onReject} className={PLAIN}>
              {m.reject}
            </button>
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
            <button
              ref={primary}
              type="button"
              onClick={() => onAccept(chosen)}
              className={PRIMARY}
            >
              {adjusting ? m.acceptAdjust : m.accept}
            </button>
            {/* In a conversation, a change is written in its box: no button for it. */}
            {!embedded && (
              <button type="button" onClick={() => setChanging(true)} className={SOFT}>
                {m.change}
              </button>
            )}
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
