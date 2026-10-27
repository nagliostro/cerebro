// The one button of the Cerebro (docs/design.md, "Botões"): a pill 44px tall, never narrower than
// 96px (a short word stays a pill, never an oval) nor wider than 280px, its words in one line.
// Four looks: the main action, a secondary one, text only, and an option of a choice (outlined,
// filled when chosen). An icon alone is a 44px circle, not one of these.

const BASE =
  'inline-flex h-11 min-w-24 max-w-70 shrink-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full px-5 whitespace-nowrap transition-colors disabled:cursor-default disabled:opacity-50';

export const BTN_PRIMARY = `${BASE} bg-white text-[oklch(0.15_0.006_265)]`;
export const BTN_SOFT = `${BASE} bg-white/8 hover:bg-white/12 hover:text-white`;
export const BTN_PLAIN = `${BASE} hover:text-white`;

/** An option of a choice (a depth, a language, a rating): filled white when it is the chosen one. */
export const btnOption = (chosen: boolean) =>
  chosen
    ? BTN_PRIMARY
    : `${BASE} shadow-[inset_0_0_0_1px_var(--cb-outline)] hover:text-(--cb-highlight)`;
