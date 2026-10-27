'use client';

import { Maximize2, X } from 'lucide-react';
import { useRef } from 'react';

// The screen a plan proposes, drawn by the Cerebro itself with the neurons' kit: the elements the
// research recorded (a short list), each as the kit's real component, in the neuron's color. No
// AI draws it, so it costs nothing, and it looks like what the Builder will make. It runs in a
// frame with no scripts (the texts came from pages: escaped, and never run).

export type ScreenItem = { kind: string; text: string; detail: string };

/** A phone's width; the frame is drawn at it and scaled for the small view. */
const WIDTH = 390;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The first option named in a detail ("US dollar, a list of currencies" → "US dollar"). */
const first = (detail: string) => detail.split(/[,;·(]/)[0]!.trim();

// The kit's own icon (Lucide arrow-up-down), inline: the frame runs no scripts.
const SWAP =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>';

const CHART = (label: string) =>
  `<svg class="cb-grafico" viewBox="0 0 358 120" role="img" aria-label="${esc(label)}"><polyline points="0,70 30,66 60,74 90,62 120,64 150,92 180,90 210,93 240,80 270,82 300,78 330,84 352,22" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.5"/><circle cx="352" cy="22" r="3.5" fill="var(--cb-cor)"/></svg>`;

/** The names inside a pair's two fields, in the owner's language. */
export type PairLabels = { value: string; choice: string };

/** One element as the kit draws it, and about how tall it is (to size the frame). */
function element(x: ScreenItem, i: number, pair: PairLabels): [string, number] {
  const t = esc(x.text);
  const field = (label: string, value = '') =>
    `<div class="cb-campo"><input id="f${i}" placeholder=" " value="${esc(value)}" readonly><label for="f${i}">${esc(label)}</label></div>`;
  const choice = (label: string, value: string) =>
    `<div class="cb-campo"><select id="s${i}" disabled><option>${esc(value || '…')}</option></select><label for="s${i}">${esc(label)}</label></div>`;
  switch (x.kind) {
    case 'headline':
      return [`<p>${t}</p>`, 20];
    case 'number':
      return [`<strong class="cb-destaque">${t}</strong>`, 36];
    case 'field':
      return [field(x.text, first(x.detail)), 52];
    case 'choice':
      return [choice(x.text, first(x.detail)), 52];
    case 'pair':
      return [
        `<div class="cb-dupla">${field(pair.value, x.text)}${choice(pair.choice, first(x.detail))}</div>`,
        52,
      ];
    case 'swap':
      return [
        `<p style="text-align:center"><span class="cb-botao-sec" aria-label="${t}">${SWAP}</span></p>`,
        44,
      ];
    case 'button':
      return [`<p><span class="cb-botao">${t}</span></p>`, 44];
    case 'tabs': {
      const tabs = x.text
        .split(/[\s,·|/]+/)
        .filter(Boolean)
        .slice(0, 8);
      return [
        `<div class="cb-abas" role="tablist">${tabs.map((b, j) => `<button role="tab" aria-selected="${j === 0}">${esc(b)}</button>`).join('')}</div>`,
        44,
      ];
    }
    case 'chart':
      return [CHART(x.text), 130];
    case 'list':
      return [
        `<p class="cb-forte">${t}</p><ul class="cb-lista">${[1, 2, 3].map(() => `<li><span>${esc(first(x.detail) || '—')}</span></li>`).join('')}</ul>`,
        170,
      ];
    case 'source':
      return [`<p>${t}</p>`, 20];
    default:
      return [`<p>${t}</p>`, 20];
  }
}

/** The whole mock as a page, and its height at a phone's width. */
export function mockPage(
  items: ScreenItem[],
  color: string,
  pair: PairLabels,
): { html: string; height: number } {
  const parts = items.map((x, i) => element(x, i, pair));
  // The page's margins, each element, and the space between them.
  const height = 48 + parts.reduce((h, [, eh]) => h + eh, 0) + 12 * Math.max(0, parts.length - 1);
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/neuron-kit/base.css">
<style>:root{--cb-cor:${esc(color)}}body{overflow:hidden}main{margin:24px auto 24px}main>*+*{margin-top:12px}select:disabled,input[readonly]{opacity:1;cursor:default}</style>
</head><body><main>${parts.map(([h]) => h).join('\n')}</main></body></html>`;
  return { html, height };
}

/**
 * The proposed screen, small, inside the plan; a touch opens it at a phone's size, over the
 * screen (Esc or the × closes it).
 */
export function ScreenMock({
  items,
  color,
  pair,
  label,
  openLabel,
  closeLabel,
}: {
  items: ScreenItem[];
  color: string;
  pair: PairLabels;
  label: string;
  openLabel: string;
  closeLabel: string;
}) {
  const big = useRef<HTMLDialogElement>(null);
  const { html, height } = mockPage(items, color, pair);
  const scale = 0.56;
  const frame = (title: string) => (
    <iframe
      title={title}
      srcDoc={html}
      sandbox=""
      tabIndex={-1}
      className="block border-0"
      style={{ width: WIDTH, height }}
    />
  );
  return (
    <>
      <div
        className="group relative mx-auto overflow-hidden rounded-[18px] shadow-[inset_0_0_0_1px_var(--cb-outline)]"
        style={{ width: WIDTH * scale, height: height * scale }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 origin-top-left"
          style={{ transform: `scale(${scale})` }}
        >
          {frame(label)}
        </div>
        {/* The whole small view opens the big one. */}
        <button
          type="button"
          onClick={() => big.current?.showModal()}
          aria-label={openLabel}
          className="absolute inset-0 cursor-zoom-in rounded-[18px]"
        >
          <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-white/8 opacity-70 transition-opacity group-hover:opacity-100">
            <Maximize2 aria-hidden className="size-3.5" strokeWidth={1.75} />
          </span>
        </button>
      </div>
      <dialog
        ref={big}
        aria-label={label}
        onClick={(e) => e.target === big.current && big.current.close()}
        className="m-auto max-h-[90dvh] max-w-[calc(100vw-32px)] overflow-auto rounded-[22px] bg-[oklch(0.11_0.006_265)] p-0 text-inherit shadow-[inset_0_0_0_1px_var(--cb-outline)] backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="sticky top-0 z-10 flex justify-end p-2">
          <button
            type="button"
            onClick={() => big.current?.close()}
            aria-label={closeLabel}
            className="grid size-11 cursor-pointer place-items-center rounded-full hover:text-white"
          >
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="-mt-11">{frame(label)}</div>
      </dialog>
    </>
  );
}
