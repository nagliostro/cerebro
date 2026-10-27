'use client';

import type { PlanRow, Step } from '@cerebro/dominus/plan';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { t, type Locale, type Messages } from '@/lib/i18n';

import { AdjustPanel } from './adjust-panel';
import { BackgroundSynapses } from './background-synapses';
import { BuildSteps, type StepPoint } from './build-steps';
import { DominusBox } from './dominus-box';
import { Memory, type MemoryProps } from './memory';
import { PlanPanel } from './plan-panel';
import { BTN_PLAIN, BTN_PRIMARY, BTN_SOFT, btnOption } from './button';

/** A plan as the core shows it: as stored, plus how long its job has run and should run. */
export type PlanView = PlanRow & {
  elapsedMs: number | null;
  expectMs: number | null;
  /** What the owner said of the result, for the tuning. */
  rating?: Rating | null;
};
type Rating = 'bad' | 'fair' | 'good';
const RATINGS: Rating[] = ['bad', 'fair', 'good'];
type Other = { id: string; name: string; color: string };

const RUNNING = new Set(['researching', 'thinking', 'building']);
const OPEN = new Set(['questions', 'ready']);

async function call<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(
    path,
    body && {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

// The core refuses a step the plan is already past (it changed elsewhere, or a second tap).
const STALE = new Set([
  'nothing to reject',
  'no plan to build',
  'nothing running',
  'nothing to undo',
]);

/** A problem code from the core, in the owner's words. */
function problemText(error: string, b: Messages['build']) {
  if (STALE.has(error)) return b.failed.stale;
  const code = error.split(':')[0]!.trim() as keyof Messages['build']['failed'];
  if (code !== 'other' && code in b.failed) return b.failed[code] as string;
  return b.failed.other(error);
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Each recorded step as a point around the Dominus; those that spend AI are gold. */
function stepPoints(
  steps: Step[],
  b: Messages['build'],
  name: (id: string) => string,
  locale: Locale,
  /** The Navegador, when it is in the Memória: its steps leave from it. */
  navegador?: string,
) {
  return steps.map((s, i): StepPoint => {
    const key = `${s.kind}-${'path' in s ? s.path : i}`;
    switch (s.kind) {
      case 'read':
        return { key, text: b.step.read(s.words), busy: false, ai: false };
      case 'memory':
        return {
          key,
          text: b.step.memory(s.neurons, s.similar ? name(s.similar) : null),
          busy: false,
          ai: false,
        };
      case 'think':
        return {
          key,
          text: s.done ? b.step.thought(b.usd(s.costUsd ?? 0)) : b.step.thinking,
          busy: !s.done,
          ai: true,
        };
      case 'file':
        return {
          key,
          text: s.done ? b.step.written(s.path) : b.step.writing(s.path),
          busy: !s.done,
          ai: true,
        };
      case 'check':
        return { key, text: b.step.checked(s.files, kb(s.bytes)), busy: false, ai: false };
      case 'wait':
        return {
          key,
          text: b.step.waiting(
            new Date(s.until).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
          ),
          busy: true,
          ai: false,
        };
      // A copy's research: each site, search and count is the AI at work (gold).
      case 'guide':
        return { key, text: b.step.guide(s.lessons), busy: false, ai: false };
      case 'browse':
        return {
          key: `browse-${s.host}`,
          text: b.step.browse(s.host, s.pages, s.done),
          busy: !s.done,
          ai: true,
          from: navegador,
        };
      case 'search':
        return {
          key: `search-${i}`,
          text: b.step.search(s.query, s.done),
          busy: !s.done,
          ai: true,
          from: navegador,
        };
      case 'cases':
        return {
          key,
          text: b.step.cases(s.count, s.done),
          busy: !s.done,
          ai: true,
          from: navegador,
        };
      case 'rules':
        return { key, text: b.step.rules(s.count), busy: false, ai: true };
      case 'findings':
        return { key, text: b.step.findings(s.count), busy: false, ai: true };
      case 'libraries':
        return { key, text: b.step.libraries(s.count), busy: false, ai: true };
      // The answer key costs nothing: the Cerebro runs it, no AI.
      case 'verify':
        return {
          key: `verify-${i}`,
          text: b.step.verify(s.passed, s.total, s.done),
          busy: !s.done,
          ai: false,
        };
    }
  });
}

/**
 * Building neurons, on the Memória or on one neuron's screen (to adjust it): the Dominus box at
 * the foot, what the Dominus is doing around it, the plan beside or below, and a caption with
 * where the work is, how long it should take and what it cost. Everything shown comes from the
 * plan the core keeps; the screen follows it live and finds it again after a reload.
 */
export function Construction({
  locale,
  others,
  target,
  initial,
  memory,
  panel,
}: {
  locale: Locale;
  others: Other[];
  /** Adjusting this neuron (its screen) instead of making a new one. */
  target?: { id: string; name: string; color?: string };
  initial: PlanView | null;
  memory?: MemoryProps;
  /** A neuron's screen: the box and the work live in its adjustments window, opened by the pencil. */
  panel?: { open: boolean; setOpen: (open: boolean) => void };
}) {
  const m = t(locale);
  const b = m.build;
  const router = useRouter();
  const docked = !!target && !!panel;
  const [undone, setUndone] = useState(0);
  const [plan, setPlan] = useState<PlanView | null>(initial);
  const [secs, setSecs] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const running = !!plan && RUNNING.has(plan.status);
  const open = !!plan && OPEN.has(plan.status);
  const planId = plan?.id;
  const status = plan?.status;

  const load = useCallback(async (id: string) => {
    try {
      setPlan(await call<PlanView>(`/api/plans/${id}`));
      setSecs(0);
    } catch {
      // The core did not answer; the next event tries again.
    }
  }, []);

  // The plan on screen, for the event stream, which stays open while plans come and go.
  const shownRef = useRef(planId);
  useEffect(() => {
    shownRef.current = planId;
  }, [planId]);

  // A plan started on another device (or another tab): the open one of this screen, if any.
  const targetId = target?.id;
  const adopt = useCallback(async () => {
    try {
      const next = await call<PlanView | null>(
        `/api/plans/current${targetId ? `?target=${targetId}` : ''}`,
      );
      if (next && next.id !== shownRef.current) {
        setPlan(next);
        setSecs(0);
      }
    } catch {
      // The core did not answer; the next event tries again.
    }
  }, [targetId]);

  // Every device follows the same plans live, the way Linear and Replicache do it: the core only
  // pokes ("plan x changed", "the graph changed") and each screen reads again what it shows.
  // A hidden screen lets go of the stream (a phone in the pocket costs nothing) and, on
  // coming back or reconnecting, reads everything again, since it may have missed events.
  useEffect(() => {
    let events: EventSource | null = null;
    let first = true;
    const resync = () => {
      if (shownRef.current) void load(shownRef.current);
      void adopt();
      if (!first) router.refresh();
      first = false;
    };
    const connect = () => {
      if (events || document.hidden) return;
      events = new EventSource('/api/events');
      events.onopen = resync;
      events.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data) as { type: string; plan: string | null };
          if (d.type === 'graph.changed') router.refresh();
          else if (d.type === 'plan.changed' && d.plan === shownRef.current) void load(d.plan);
          else if (d.type === 'plan.changed') void adopt();
        } catch {
          // Not an event.
        }
      };
    };
    const onVisibility = () => {
      if (!document.hidden) return connect();
      events?.close();
      events = null;
    };
    connect();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      events?.close();
    };
  }, [load, adopt, router]);

  // On a neuron's screen, work going on opens the adjustments window: that is where it shows.
  const setPanel = panel?.setOpen;
  useEffect(() => {
    if (docked && running) setPanel?.(true);
  }, [docked, running, setPanel]);

  // While it runs, count the seconds.
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [running, planId]);

  // A neuron made, adjusted or taken back: the screen reads the graph (or the application) again.
  useEffect(() => {
    if (status === 'built' || status === 'undone') router.refresh();
  }, [status, router]);

  // Canceled: it says so for a moment, then the screen is back where it was.
  useEffect(() => {
    if (status !== 'canceled') return;
    const timer = setTimeout(() => setPlan(null), 4000);
    return () => clearTimeout(timer);
  }, [status, planId]);

  const stop = useCallback(async () => {
    if (!planId) return;
    await call(`/api/plans/${planId}/cancel`, {}).catch(() => undefined);
    void load(planId);
  }, [planId, load]);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void stop();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, stop]);

  async function start(request: string, files: File[] = [], on = target?.id) {
    setProblem(null);
    try {
      let id: string;
      if (files.length) {
        // With files: a form (they go to the data folder before the core sees the request).
        const form = new FormData();
        form.set('request', request);
        if (on) form.set('target', on);
        for (const f of files) form.append('files', f);
        const res = await fetch('/api/plans', { method: 'POST', body: form });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
        id = data.id;
      } else id = (await call<{ id: string }>('/api/plans', { request, target: on })).id;
      await load(id);
      return true;
    } catch (e) {
      setProblem(problemText((e as Error).message, b));
      return false;
    }
  }

  /** Takes back the last adjustment (from the adjustments window): the previous one returns. */
  async function undoPlan(id: string) {
    setProblem(null);
    try {
      await call(`/api/plans/${id}/undo`, {});
      setUndone((n) => n + 1);
      // The one on screen now says it was undone.
      if (planId === id) await load(id);
      router.refresh();
    } catch (e) {
      setProblem(problemText((e as Error).message, b));
    }
  }

  // One action at a time: on a slow connection a second tap would arrive after the first.
  const acting = useRef(false);
  async function act(
    action: 'answer' | 'accept' | 'reject' | 'undo' | 'rate',
    body: object = {},
    files: File[] = [],
  ) {
    if (!plan || acting.current) return false;
    acting.current = true;
    setProblem(null);
    try {
      let next: PlanView;
      if (files.length) {
        // An answer with a drawing: a form, as a request with files.
        const form = new FormData();
        form.set('text', (body as { text?: string }).text ?? '');
        for (const f of files) form.append('files', f);
        const res = await fetch(`/api/plans/${plan.id}/${action}`, { method: 'POST', body: form });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
        next = data;
      } else next = await call<PlanView>(`/api/plans/${plan.id}/${action}`, body);
      setPlan(action === 'reject' ? null : next);
      setSecs(0);
      return true;
    } catch (e) {
      setProblem(problemText((e as Error).message, b));
      return false;
    } finally {
      acting.current = false;
    }
  }

  const name = (id: string) => others.find((o) => o.id === id)?.name ?? id;
  const navegador = others.some((o) => o.id === 'navegador') ? 'navegador' : undefined;
  const points = plan ? stepPoints(plan.steps, b, name, locale, navegador) : [];
  const files = plan?.steps.filter((s) => s.kind === 'file').length ?? 0;
  const neuronName = target?.name ?? plan?.plan?.name ?? '';

  function countdown() {
    if (!plan) return null;
    const wait = plan.steps.find((s) => s.kind === 'wait');
    if (wait) return null; // the waiting step says it
    if (plan.expectMs === null) return b.firstTime;
    const left = Math.round((plan.expectMs - (plan.elapsedMs ?? 0) - secs * 1000) / 1000);
    return left <= 0 ? b.late : b.left(Math.floor(left / 60), left % 60);
  }

  // A copy was checked against its answer key: the last round says how it ended.
  const verified = plan?.steps.findLast((s) => s.kind === 'verify');

  let caption: React.ReactNode = null;
  if (problem) caption = <p className="cb-pill">{problem}</p>;
  else if (plan && running) {
    const busy = points.findLast((p) => p.busy);
    caption = (
      <>
        <p className="cb-pill">
          {plan.status === 'building' ? (
            (target ? b.adjusting : b.building)(neuronName, files)
          ) : (
            <span className="cb-busy">
              {busy?.text ?? (plan.status === 'researching' ? b.step.researching : b.step.thinking)}
            </span>
          )}
        </p>
        {countdown() && <p className="cb-pill">{countdown()}</p>}
        {plan.status === 'building' && busy && (
          <p className="cb-pill min-[820px]:hidden">
            <span className="cb-busy">{busy.text}</span>
          </p>
        )}
      </>
    );
  } else if (plan?.status === 'built') {
    caption = (
      <>
        <p className="cb-pill text-(--cb-highlight)">
          {(target ? b.adjusted : b.built)(neuronName)}
        </p>
        {verified && <p className="cb-pill">{b.verified(verified.passed, verified.total)}</p>}
        <p className="cb-pill text-(--cb-cost)">
          {(target ? b.adjustCost : b.buildCost)(
            plan.buildCostUsd === null ? null : b.usd(plan.buildCostUsd),
          )}
        </p>
        {/* The owner's word on the result tunes the Dominus (no AI): which values solve best. */}
        {/* The question on its own line: the three options keep their size on any screen. */}
        <div role="group" aria-label={b.rate} className="grid gap-1.5">
          <span className="px-1">{b.rate}</span>
          <div className="flex flex-wrap gap-2">
            {RATINGS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={plan.rating === r}
                onClick={() => void act('rate', { rating: r })}
                className={btnOption(plan.rating === r)}
              >
                {b.ratings[r]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {/* In the conversation too: the live word is that request's answer there. */}
          {target && plan.adjusting && (
            <button type="button" onClick={() => void act('undo')} className={BTN_SOFT}>
              {b.undo}
            </button>
          )}
          {!target && plan.neuron && (
            <Link href={`/neuron/${plan.neuron}`} className={BTN_PRIMARY}>
              {b.open(neuronName)}
            </Link>
          )}
          <button type="button" onClick={() => setPlan(null)} className={BTN_PLAIN}>
            {b.close}
          </button>
        </div>
      </>
    );
  } else if (plan?.status === 'failed') {
    caption = (
      <>
        <p className="cb-pill">{problemText(plan.error ?? '', b)}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void start(plan.request)} className={BTN_SOFT}>
            {b.retry}
          </button>
          <button type="button" onClick={() => setPlan(null)} className={BTN_PLAIN}>
            {b.close}
          </button>
        </div>
      </>
    );
  } else if (plan?.status === 'undone')
    caption = (
      <>
        <p className="cb-pill">{b.undone(neuronName)}</p>
        <button type="button" onClick={() => setPlan(null)} className={BTN_PLAIN}>
          {b.close}
        </button>
      </>
    );
  else if (plan?.status === 'canceled')
    caption = <p className="cb-pill">{plan.buildJob ? b.buildCanceled : b.canceled}</p>;

  return (
    <>
      {/* While the AI thinks or builds (tokens being spent), synapses stroll across the sky. */}
      <BackgroundSynapses active={running} />

      {memory && (
        <Memory
          {...memory}
          busy={running}
          dominusColor={plan?.status === 'building' ? (plan.color ?? undefined) : undefined}
          aside={open}
        >
          {plan && (running || open) && <BuildSteps steps={points} aside={open} />}
        </Memory>
      )}

      {caption && !open && !docked && (
        <div
          data-avoid
          role="status"
          aria-live="polite"
          className="fixed bottom-[104px] left-1/2 z-40 grid w-[min(100%-32px,34rem)] -translate-x-1/2 justify-items-center gap-1.5 text-center"
        >
          {caption}
        </div>
      )}

      {!docked && (
        <DominusBox
          label={target ? b.askAdjust(target.name) : b.ask}
          sendLabel={b.send}
          stopLabel={b.stop}
          attachLabel={b.attach}
          removeLabel={b.removeAttachment}
          tooMany={b.attachLimits}
          busy={running}
          onSend={start}
          onStop={() => void stop()}
          className={
            open ? 'max-xl:hidden xl:left-[calc(50%-200px)] xl:w-[min(100%-480px,40rem)]' : ''
          }
        />
      )}

      {docked && panel.open && !(plan && open && plan.plan) && (
        <AdjustPanel
          neuron={target.id}
          name={target.name}
          color={target.color ?? 'white'}
          locale={locale}
          live={caption}
          liveId={plan?.id}
          refresh={`${plan?.id}-${plan?.status}-${undone}`}
          onUndo={(id) => void undoPlan(id)}
          onClose={() => panel.setOpen(false)}
          box={(label) => (
            <DominusBox
              docked
              label={label}
              sendLabel={b.send}
              stopLabel={b.stop}
              attachLabel={b.attach}
              removeLabel={b.removeAttachment}
              tooMany={b.attachLimits}
              busy={running}
              onSend={start}
              onStop={() => void stop()}
            />
          )}
        />
      )}

      {plan && open && plan.plan && (
        <PlanPanel
          plan={plan}
          others={others}
          m={b}
          windows={m.window}
          locale={locale}
          onAnswer={(text, files) => act('answer', { text }, files)}
          onAccept={(improvements) => void act('accept', { improvements })}
          onReject={() => void act('reject')}
          onAdjust={async (neuron) => {
            // The same request, as an adjustment of that neuron, on its own screen.
            const request = plan.request;
            await act('reject');
            if (await start(request, [], neuron)) router.push(`/neuron/${neuron}`);
          }}
        />
      )}
    </>
  );
}
