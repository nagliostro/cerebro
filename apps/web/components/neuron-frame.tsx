'use client';

import { useEffect, useRef } from 'react';

import { isNoticeKind, notify } from '@/lib/toast';

/** An application link without its signature: /apps/{id}/{token}/... */
const unsigned = (src: string) => src.replace(/^(\/apps\/[^/]+\/)[^/]+/, '$1');

/**
 * A neuron's application, isolated in a sandboxed frame over the same sky. Its bridge
 * (neuron-kit/cerebro.js) talks only to this page, which takes messages only from its own frame
 * and forwards just two kinds to the server: the neuron's own data and calls to other neurons
 * through the contract. Answers go back only to that frame.
 */
export function NeuronFrame({ id, src, title }: { id: string; src: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // A neuron's notice is the Cerebro's (lib/toast.ts), cut to size; the same one said again
    // replaces itself on screen, so a neuron cannot pile them up.
    const say = (m: Record<string, unknown>) => {
      const kind = isNoticeKind(m.kind) ? m.kind : 'info';
      const title = String(m.text);
      const description = typeof m.description === 'string' ? m.description : undefined;
      notify.show(kind, { id: `${id}:${kind}:${title}`, title, description });
    };
    const reply = (requestId: unknown, answer: object) =>
      // The frame's origin is opaque ("null"), so "*" is the only target; the window is its own.
      frame.current?.contentWindow?.postMessage({ cerebro: 'reply', requestId, ...answer }, '*');

    const onMessage = async (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = e.data as Record<string, unknown> | null;
      if (m?.cerebro === 'notify' && typeof m.text === 'string') return say(m);
      if (m?.cerebro !== 'request' || !['data', 'call', 'net'].includes(String(m.kind))) return;
      const body =
        m.kind === 'data'
          ? { kind: 'data', collection: m.collection, op: m.op, input: m.input }
          : m.kind === 'call'
            ? { kind: 'call', target: m.target, operation: m.operation, input: m.input }
            : { kind: 'net', url: m.url, why: m.why };
      try {
        const res = await fetch(`/api/neurons/${id}/bridge`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        reply(m.requestId, res.ok ? { ok: true, result: data } : { ok: false, error: data.error });
      } catch {
        reply(m.requestId, { ok: false, error: 'the Cerebro did not answer' });
      }
    };
    window.addEventListener('message', onMessage);
    // The frame gets its address only once this page listens, so no early request is lost.
    // Each read of the page signs the link again (coming back to the window, an event); the
    // frame keeps what the owner was doing and reloads only for another application, version
    // or language.
    const loaded = frame.current?.getAttribute('src');
    if (frame.current && (!loaded || unsigned(loaded) !== unsigned(src))) frame.current.src = src;
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [id, src]);

  return (
    <iframe
      ref={frame}
      title={title}
      sandbox="allow-scripts allow-forms allow-downloads"
      className="w-full flex-1 border-0 bg-transparent [color-scheme:dark]"
    />
  );
}
