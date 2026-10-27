import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkDraft } from '../src/builder/install.ts';
import { chooseCode, outline, parts, renderMap, words } from '../src/builder/map.ts';
import { planPrompt } from '../src/builder/prompts.ts';

// The map of a neuron and the code the planner reads: made by code, no AI.

const APP = `const state = {};

function render(list) {
  document.querySelector('#lista').innerHTML = list.map((x) => x.text).join('');
}

async function salvar(text) {
  await cerebro.data('itens').create({ text });
}

const formatMoney = (n) => n.toFixed(2);
`;
const HTML = `<!doctype html>
<title>Gastos</title>
<main>
  <h1>Meus gastos</h1>
  <form id="novo"><button id="salvar">Salvar</button></form>
  <ul id="lista"></ul>
</main>`;

describe('the outline of a file', () => {
  it('names what it has: functions and data, headings and ids, own classes', () => {
    expect(outline('app.js', APP)).toBe('functions render, salvar, formatMoney; data itens');
    expect(outline('index.html', HTML)).toBe(
      'title "Gastos"; headings "Meus gastos"; ids novo, salvar, lista',
    );
    expect(outline('style.css', '.cb-linha { } .total { } .total:hover {}')).toBe('classes total');
    // Inside one block, as many applications keep them.
    const block = '(() => {\n  function desenhar() {}\n  const trocar = () => {};\n})();';
    expect(outline('app.js', block)).toBe('functions desenhar, trocar');
  });
});

describe('the code the planner reads', () => {
  const files = [
    { path: 'index.html', text: HTML },
    { path: 'app.js', text: APP },
    { path: 'vendor/chart.js/chart.umd.js', text: 'x'.repeat(50_000) },
  ];

  it('a small neuron goes whole, without the libraries it carries', () => {
    const r = chooseCode(files, 'mude o título', '', 10_000);
    expect(r.partial).toBe(false);
    expect(r.code.map((f) => f.path)).toEqual(['index.html', 'app.js']);
  });

  it('a large one goes in the parts that share words with the request', () => {
    const r = chooseCode(files, 'o formato do dinheiro (formatMoney) com 3 casas', '', 200);
    expect(r.partial).toBe(true);
    expect(r.code).toEqual([
      { path: 'app.js', text: expect.stringContaining('formatMoney'), only: ['formatMoney'] },
    ]);
  });

  it('the notes lend their names to words the code does not have', () => {
    // "valor" is nowhere in the code; the notes say where the money is formatted.
    const notes = 'Valor em reais: app.js formatMoney';
    const r = chooseCode(files, 'mostrar o valor sem centavos', notes, 200);
    expect(r.code[0]!.only).toContain('formatMoney');
  });

  it('with nothing in common, the start of the code, within the limit', () => {
    const r = chooseCode(files, 'zzz', '', 300);
    expect(r.partial).toBe(true);
    expect(r.code.reduce((n, f) => n + f.text.length, 0)).toBeLessThanOrEqual(300);
  });

  it('splits a script by what each part starts with', () => {
    expect(parts('app.js', APP).map((p) => p.name)).toEqual([
      'state',
      'render',
      'salvar',
      'formatMoney',
    ]);
    expect(words('formatMoney do Botão')).toEqual(new Set(['format', 'money', 'botao']));
  });
});

describe('the map', () => {
  const map = renderMap({
    id: 'gastos',
    name: 'Gastos',
    role: 'life',
    files: [{ path: 'app.js', bytes: 2048, outline: 'functions render' }],
    collections: [{ name: 'itens', fields: ['text'], count: 3 }],
    reads: ['agenda'],
    readBy: [],
    sites: [{ host: 'api.bcb.gov.br', why: 'cotação' }],
    libraries: ['chart.js'],
    requests: [{ at: Date.UTC(2026, 9, 27), kind: 'adjusted', request: 'total', ok: true }],
    notes: 'n'.repeat(500),
    maxNotes: 100,
  });

  it('says what the code says, and only as much of the notes as allowed', () => {
    expect(map).toContain('- app.js (2.0 KB): functions render');
    expect(map).toContain('- itens: text (3 records)');
    expect(map).toContain('- reads: agenda');
    expect(map).toContain('- api.bcb.gov.br: cotação');
    expect(map).toContain('- 2026-10-27 adjusted: total');
    expect(map.split('## Notes\n')[1]!.trim()).toHaveLength(100);
  });

  it('goes to the planner, with the parts shown named', () => {
    const p = planPrompt({
      request: 'r',
      locale: 'en',
      exchanges: [],
      neurons: [],
      target: {
        id: 'gastos',
        name: 'Gastos',
        role: 'life',
        collections: [],
        map,
        code: [{ path: 'app.js', text: 'x', only: ['render'] }],
        partial: true,
      },
    });
    expect(p).toContain('Its map:\n# Gastos (gastos)');
    expect(p).toContain('--- app.js (only: render)');
    expect(p).toContain('only the parts that share words');
  });

  it('its notes stay in the application through the draft check', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-map-'));
    await writeFile(path.join(dir, 'index.html'), '<main></main>');
    await writeFile(path.join(dir, 'NOTAS.md'), 'notes');
    await writeFile(path.join(dir, 'README.md'), 'no');
    expect(await checkDraft(dir)).toMatchObject({ files: 1 });
    expect((await readdir(dir)).sort()).toEqual(['NOTAS.md', 'index.html']);
    await rm(dir, { recursive: true, force: true });
  });
});
