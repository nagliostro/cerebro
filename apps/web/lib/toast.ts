// The Cerebro's notices (toasts): the one way any screen, and any neuron through its bridge, says
// how an operation went. Sonner draws them (components/toaster.tsx); nothing else imports it, so
// every notice has the same look, place, timing and wording rules (docs/design.md, "Avisos").
//
// A notice is a title that says what happened ("Neurônio excluído", "Não deu para salvar") and,
// when it helps, a description with the detail or what to do next. Never a bare "Erro".

import { toast as sonner } from 'sonner';

export type NoticeKind = 'success' | 'error' | 'warning' | 'info';

export type Notice = {
  /** What happened, short: "Celular pareado", "Não deu para renomear". */
  title: string;
  /** The detail, the reason or the next step, in a sentence. */
  description?: string;
  /** One action that undoes or follows the operation ("Desfazer", "Tentar de novo"). */
  action?: { label: string; onClick: () => void };
  /** The same id replaces the notice on screen instead of stacking another. */
  id?: string | number;
};

/** How long each kind stays: an error and a warning need the time to be read. */
export const DURATION: Record<NoticeKind | 'loading', number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  error: 8000,
  loading: Infinity,
};

const LIMIT = { title: 120, description: 280 };
const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

function show(kind: NoticeKind, n: Notice | string) {
  const { title, description, action, id } = typeof n === 'string' ? { title: n } : n;
  return sonner[kind](cut(title, LIMIT.title), {
    id,
    description: description ? cut(description, LIMIT.description) : undefined,
    action,
    duration: DURATION[kind],
  });
}

export const notify = {
  success: (n: Notice | string) => show('success', n),
  error: (n: Notice | string) => show('error', n),
  warning: (n: Notice | string) => show('warning', n),
  info: (n: Notice | string) => show('info', n),
  /** Work that takes a while; finish it with success or error under the same id. */
  loading: (n: Notice | string) => {
    const { title, description, id } = typeof n === 'string' ? { title: n } : n;
    return sonner.loading(title, { id, description, duration: DURATION.loading });
  },
  /** An operation followed from start to end: one notice that turns into its outcome. */
  promise: <T>(
    work: Promise<T>,
    words: {
      loading: string;
      success: string | ((result: T) => Notice | string);
      error: string | ((e: Error) => Notice | string);
    },
  ) => {
    const id = sonner.loading(words.loading, { duration: DURATION.loading });
    work.then(
      (r) => show('success', { id, ...asNotice(words.success, r) }),
      (e) => show('error', { id, ...asNotice(words.error, e as Error) }),
    );
    return work;
  },
  dismiss: (id?: string | number) => sonner.dismiss(id),
  /** A notice of a kind known only at run time (a neuron's, through its bridge). */
  show,
};

function asNotice<A>(w: string | ((a: A) => Notice | string), a: A): Notice {
  const n = typeof w === 'function' ? w(a) : w;
  return typeof n === 'string' ? { title: n } : n;
}

/**
 * A failed operation: what did not happen, and why when the core said it in words (a bare HTTP
 * status or a dropped connection says nothing to the owner, so then: nothing changed, try again).
 */
export function notifyFailure(
  title: string,
  e: unknown,
  words: { why: (why: string) => string; nothingChanged: string },
) {
  const why = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const useless = !why || /^\d{3}$|^HTTP \d{3}$|fetch|network/i.test(why);
  return show('error', { title, description: useless ? words.nothingChanged : words.why(why) });
}

/** The kinds a neuron may ask for; anything else is a plain notice. */
export const isNoticeKind = (k: unknown): k is NoticeKind =>
  k === 'success' || k === 'error' || k === 'warning' || k === 'info';
