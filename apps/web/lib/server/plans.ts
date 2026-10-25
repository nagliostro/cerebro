import { coreRequest } from '@/lib/server/core';

import type { PlanView } from '@/components/construction';

/** The plan still open on a screen (the Memória, or one neuron's); null when none or no core. */
export const currentPlan = (target: string | null) =>
  coreRequest<PlanView | null>('GET', `/plans/current${target ? `?target=${target}` : ''}`).catch(
    () => null,
  );
