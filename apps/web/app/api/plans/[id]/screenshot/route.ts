import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { PlanRow } from '@cerebro/dominus/plan';
import { dataDir } from '@cerebro/dominus/data-dir';

import { coreRequest } from '@/lib/server/core';
import { hasSession, unauthorized, validPlanId } from '@/lib/server/require-session';

// The main screenshot of a copy's research (the original's screen, in the plan). The file name
// comes from the plan the core keeps, never from the address.

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return unauthorized();
  const { id } = await params;
  const missing = () => new Response(null, { status: 404 });
  if (!validPlanId(id)) return missing();
  const plan = await coreRequest<PlanRow>('GET', `/plans/${id}`).catch(() => null);
  const file = plan?.research?.screenshot;
  if (!file || !/^shot-\d{1,3}\.png$/.test(file)) return missing();
  const png = await readFile(path.join(dataDir(), 'research', id, file)).catch(() => null);
  if (!png) return missing();
  return new Response(new Uint8Array(png), {
    headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=3600' },
  });
}
