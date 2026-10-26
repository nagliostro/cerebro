'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A neuron's application, isolated in a sandboxed frame over the same sky. Its bridge
 * (neuron-kit/cerebro.js) talks only to this page, which takes messages only from its own frame
 * and forwards just two kinds to the server: the neuron's own data and calls to other neurons
 * through the contract. Answers go back only to that frame.
 */
export function NeuronFrame({ id, src, title }: { id: string; src: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const say = (text: string) => {
      setNotice(text.slice(0, 120));
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(null), 2400);
    };
    const reply = (requestId: unknown, answer: object) =>
      // The frame's origin is opaque ("null"), so "*" is the only target; the window is its own.
      frame.current?.contentWindow?.postMessage({ cerebro: 'reply', requestId, ...answer }, '*');

    const onMessage = async (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = e.data as Record<string, unknown> | null;
      if (m?.cerebro === 'notify' && typeof m.text === 'string') return say(m.text);
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
    if (frame.current && frame.current.getAttribute('src') !== src) frame.current.src = src;
    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };
  }, [id, src]);

  return (
    <>
      <iframe
        ref={frame}
        title={title}
        sandbox="allow-scripts allow-forms allow-downloads"
        className="w-full flex-1 border-0 bg-transparent [color-scheme:dark]"
      />
      <p
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-[104px] left-1/2 w-[min(90vw,32rem)] -translate-x-1/2 text-center transition-all duration-300 ${notice ? 'opacity-100' : 'translate-y-2 opacity-0'}`}
      >
        {notice}
      </p>
    </>
  );
}
