import { coreEvents } from '@cerebro/dominus/client';

import { hasSession, unauthorized } from '@/lib/server/require-session';

// The screens follow a plan live: the core's events, only those a screen needs (a plan changed,
// the graph changed), and only their ids; the screen then reads what it needs.

export const dynamic = 'force-dynamic';

const PASS = new Set(['plan.changed', 'graph.changed']);

export async function GET(request: Request) {
  if (!(await hasSession())) return unauthorized();
  const stop = new AbortController();
  request.signal.addEventListener('abort', () => stop.abort());
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          stop.abort();
        }
      };
      send(': open\n\n');
      coreEvents((e) => {
        if (PASS.has(e.type))
          send(`data: ${JSON.stringify({ type: e.type, plan: e.plan ?? null })}\n\n`);
      }, stop.signal)
        .catch(() => undefined)
        .finally(() => {
          try {
            controller.close();
          } catch {
            // Already closed by the browser.
          }
        });
    },
    cancel: () => stop.abort(),
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform' },
  });
}
