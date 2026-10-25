'use client';

import { ArrowUp } from 'lucide-react';
import { useRef, useState } from 'react';

const HISTORY = 'cerebro.asked';
const KEEP = 30;

/** What the owner asked before, newest last; kept only in this browser, and only if it can. */
function history(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY) ?? '[]');
  } catch {
    return [];
  }
}
function remember(text: string) {
  try {
    const list = history().filter((t) => t !== text);
    localStorage.setItem(HISTORY, JSON.stringify([...list, text].slice(-KEEP)));
  } catch {
    // Not kept in this browser; the box works the same.
  }
}

/**
 * The one box to talk to the Dominus, at the foot of the screen. The name is inside the field;
 * the send button shows only when there is text; while the Dominus works it becomes the stop
 * button (Esc does the same). Enter sends, Shift+Enter breaks the line, and ↑ ↓ (from the first
 * or last line) bring back what was asked before, as in a terminal.
 */
export function DominusBox({
  label,
  sendLabel,
  stopLabel,
  busy,
  onSend,
  onStop,
  className = '',
}: {
  label: string;
  sendLabel: string;
  stopLabel: string;
  busy: boolean;
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
  className?: string;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Where ↑ ↓ are in the history: null while writing something new.
  const at = useRef<number | null>(null);

  async function submit() {
    if (busy) return onStop();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    if (await onSend(value)) {
      remember(value);
      at.current = null;
      setText('');
    }
    setSending(false);
  }

  const show = busy || text.trim().length > 0;
  return (
    <form
      className={`fixed bottom-6 left-1/2 z-40 w-[min(100%-32px,40rem)] -translate-x-1/2 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div
        className="cb-light flex min-h-14 items-end gap-1 rounded-[10px] bg-[oklch(0.13_0.006_265/0.75)] py-2.5 pr-2.5 pl-3.5 backdrop-blur-md transition-shadow has-[textarea:focus-visible]:shadow-[inset_0_0_0_1px_oklch(1_0_0/45%)]"
        data-busy={busy ? '' : undefined}
      >
        <div className="relative flex-1">
          <textarea
            id="dominus-ask"
            rows={1}
            value={text}
            placeholder=" "
            maxLength={4000}
            onChange={(e) => {
              at.current = null;
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              } else if (e.key === 'Escape' && busy) onStop();
              else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                const box = e.currentTarget;
                const first = !box.value.slice(0, box.selectionStart).includes('\n');
                const last = !box.value.slice(box.selectionEnd).includes('\n');
                const list = history();
                if (e.key === 'ArrowUp' && first && list.length) {
                  e.preventDefault();
                  at.current = Math.max(0, (at.current ?? list.length) - 1);
                  setText(list[at.current]!);
                } else if (e.key === 'ArrowDown' && last && at.current !== null) {
                  e.preventDefault();
                  at.current = at.current + 1 < list.length ? at.current + 1 : null;
                  setText(at.current === null ? '' : list[at.current]!);
                }
              }
            }}
            className="peer block [field-sizing:content] max-h-[8lh] min-h-[1lh] w-full resize-none bg-transparent pt-3.5 pb-0.5 text-(--cb-highlight) outline-none"
          />
          <label
            htmlFor="dominus-ask"
            className="pointer-events-none absolute top-[9px] left-0 transition-all duration-200 peer-focus:-top-1 peer-focus:text-[10px] peer-[:not(:placeholder-shown)]:-top-1 peer-[:not(:placeholder-shown)]:text-[10px]"
          >
            {label}
          </label>
        </div>
        {show && (
          <button
            type="submit"
            aria-label={busy ? stopLabel : sendLabel}
            className="grid size-11 shrink-0 animate-[cb-pop_0.2s_ease-out] cursor-pointer place-items-center"
          >
            <span className="grid size-9 place-items-center rounded-md bg-white text-black">
              {busy ? (
                <span aria-hidden className="size-2.5 rounded-[2px] bg-black" />
              ) : (
                <ArrowUp aria-hidden className="size-4" strokeWidth={2} />
              )}
            </span>
          </button>
        )}
      </div>
    </form>
  );
}
