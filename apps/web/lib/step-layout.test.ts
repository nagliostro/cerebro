import { describe, expect, it } from 'vitest';

import { CHAR_W, layout, type Rect } from './step-layout';

// The steps around the Dominus: however many and however long, no label covers another, none
// covers what must stay clear, and they spread over the screen instead of piling up.

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the steps on the screen', () => {
  const labels = [
    'Pedido lido · copiar uma função de mobills.com.br',
    'Consultando a memória',
    'Guia de clonar lido',
    ...Array.from({ length: 9 }, (_, i) => `Buscou: mobills como cadastrar despesa ${i} ajuda`),
    '5 regras com fonte',
    '3 bibliotecas livres conferidas',
  ];
  const dominus = { x: 720, y: 462 };
  const navegador = { x: 1100, y: 600 };
  const origins = labels.map((_, i) => (i > 2 && i % 2 ? navegador : dominus));
  const obstacles: Rect[] = [
    { x: 690, y: 432, w: 60, h: 60 }, // the Dominus
    { x: 1078, y: 578, w: 44, h: 44 }, // the Navegador
    { x: 400, y: 820, w: 640, h: 56 }, // the box
  ];
  const area = { left: 0, top: 70, bottom: 790, right: 1440 };

  it('never lets two labels touch, nor a label cover what must stay clear', () => {
    const placed = layout({ labels, origins, obstacles, area });
    const shown = placed.filter((p) => p !== null);
    expect(shown.length).toBe(labels.length);
    for (const [i, a] of shown.entries()) {
      for (const b of shown.slice(i + 1)) expect(overlap(a.label, b.label)).toBe(false);
      for (const o of obstacles) expect(overlap(a.label, o)).toBe(false);
      expect(a.label.x).toBeGreaterThanOrEqual(0);
      expect(a.label.x + a.label.w).toBeLessThanOrEqual(area.right);
      expect(a.y).toBeGreaterThanOrEqual(area.top);
      expect(a.y).toBeLessThanOrEqual(area.bottom);
    }
  });

  it('spreads over the screen, and a new step never moves the earlier ones', () => {
    const placed = layout({ labels, origins, obstacles, area }).filter((p) => p !== null);
    const xs = placed.map((p) => p.x);
    const ys = placed.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(500);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(250);
    const fewer = layout({ labels: labels.slice(0, 6), origins, obstacles, area });
    expect(fewer).toEqual(layout({ labels, origins, obstacles, area }).slice(0, 6));
  });

  it('keeps clear of an open plan on the right', () => {
    const narrow = { ...area, right: 1440 - 416 };
    for (const p of layout({ labels, origins, obstacles, area: narrow }))
      if (p) expect(p.label.x + p.label.w).toBeLessThanOrEqual(narrow.right);
    expect(CHAR_W).toBeGreaterThan(6);
  });
});
