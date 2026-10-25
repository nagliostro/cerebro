'use client';

import type { PlanRow, Step } from '@cerebro/dominus/plan';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { t, type Locale, type Messages } from '@/lib/i18n';

import { BuildSteps, type StepPoint } from './build-steps';
import { DominusBox } from './dominus-box';
import { Memory, type MemoryProps } from './memory';
import { PlanPanel } from './plan-panel';

/** A plan as the core shows it: as stored, plus how long its job has run and should run. */
export type PlanView = PlanRow & { elapsedMs: number | null; expectMs: number | null };
type Other = { id: string; name: string; color: string };

const RUNNING = new Set(['thinking', 'building']);
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

/** A problem code from the core, in the owner's words. */
function problemText(error: string, b: Messages['build']) {
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
}: {
  locale: Locale;
  others: Other[];
  /** Adjusting this neuron (its screen) instead of making a new one. */
  target?: { id: string; name: string };
  initial: PlanView | null;
  memory?: MemoryProps;
}) {
  const m = t(locale);
  const b = m.build;
  const router = useRouter();
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

  // While it runs, follow it live (no asking again and again) and count the seconds.
  useEffect(() => {
    if (!planId || !running) return;
    const events = new EventSource('/api/events');
    events.onopen = () => void load(planId);
    events.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data) as { type: string; plan: string | null };
        if (d.type === 'plan.changed' && d.plan === planId) void load(planId);
      } catch {
        // Not an event.
      }
    };
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => {
      events.close();
      clearInterval(tick);
    };
  }, [planId, running, load]);

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

  async function start(request: string) {
    setProblem(null);
    try {
      const { id } = await call<{ id: string }>('/api/plans', { request, target: target?.id });
      await load(id);
      return true;
    } catch (e) {
      setProblem(problemText((e as Error).message, b));
      return false;
    }
  }

  async function act(action: 'answer' | 'accept' | 'reject' | 'undo', text?: string) {
    if (!plan) return false;
    setProblem(null);
    try {
      const next = await call<PlanView>(`/api/plans/${plan.id}/${action}`, { text });
      setPlan(action === 'reject' ? null : next);
      setSecs(0);
      return true;
    } catch (e) {
      setProblem(problemText((e as Error).message, b));
      return false;
    }
  }

  const name = (id: string) => others.find((o) => o.id === id)?.name ?? id;
  const points = plan ? stepPoints(plan.steps, b, name, locale) : [];
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
            <span className="cb-busy">{busy?.text ?? b.step.thinking}</span>
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
        <p className="cb-pill text-(--cb-cost)">
          {(target ? b.adjustCost : b.buildCost)(
            plan.buildCostUsd === null ? null : b.usd(plan.buildCostUsd),
          )}
        </p>
        <div className="flex gap-2">
          {target && plan.adjusting && (
            <button
              type="button"
              onClick={() => void act('undo')}
              className="inline-flex h-11 cursor-pointer items-center rounded-full bg-white/8 px-5 hover:text-white"
            >
              {b.undo}
            </button>
          )}
          {!target && plan.neuron && (
            <Link
              href={`/neuron/${plan.neuron}`}
              className="inline-flex h-11 items-center rounded-full bg-white px-5 text-[oklch(0.15_0.006_265)]"
            >
              {b.open(neuronName)}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setPlan(null)}
            className="inline-flex h-11 cursor-pointer items-center rounded-full px-3 hover:text-white"
          >
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
          <button
            type="button"
            onClick={() => void start(plan.request)}
            className="inline-flex h-11 cursor-pointer items-center rounded-full bg-white/8 px-5 hover:text-white"
          >
            {b.retry}
          </button>
          <button
            type="button"
            onClick={() => setPlan(null)}
            className="inline-flex h-11 cursor-pointer items-center rounded-full px-3 hover:text-white"
          >
            {b.close}
          </button>
        </div>
      </>
    );
  } else if (plan?.status === 'undone')
    caption = (
      <>
        <p className="cb-pill">{b.undone(neuronName)}</p>
        <button
          type="button"
          onClick={() => setPlan(null)}
          className="inline-flex h-11 cursor-pointer items-center rounded-full px-3 hover:text-white"
        >
          {b.close}
        </button>
      </>
    );
  else if (plan?.status === 'canceled')
    caption = <p className="cb-pill">{plan.buildJob ? b.buildCanceled : b.canceled}</p>;

  return (
    <>
      {memory && (
        <Memory
          {...memory}
          busy={running}
          dominusColor={plan?.status === 'building' ? (plan.color ?? undefined) : undefined}
          aside={open}
        >
          {plan && (running || open) && <BuildSteps steps={points} />}
        </Memory>
      )}

      {caption && !open && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[104px] left-1/2 z-40 grid w-[min(100%-32px,34rem)] -translate-x-1/2 justify-items-center gap-1.5 text-center"
        >
          {caption}
        </div>
      )}

      <DominusBox
        label={target ? b.askAdjust(target.name) : b.ask}
        sendLabel={b.send}
        stopLabel={b.stop}
        busy={running}
        onSend={start}
        onStop={() => void stop()}
        className={
          open ? 'max-xl:hidden xl:left-[calc(50%-200px)] xl:w-[min(100%-480px,40rem)]' : ''
        }
      />

      {plan && open && plan.plan && (
        <PlanPanel
          plan={plan}
          others={others}
          m={b}
          windows={m.window}
          locale={locale}
          onAnswer={(text) => act('answer', text)}
          onAccept={() => void act('accept')}
          onReject={() => void act('reject')}
        />
      )}
    </>
  );
}
