import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BuildCheckError, checkDraft } from '../src/builder/install.ts';
import { parsePlan, PlanError, Plans } from '../src/builder/plan.ts';
import { BUILD_SYSTEM, buildPrompt, PLAN_SYSTEM, planPrompt } from '../src/builder/prompts.ts';
import { listFiles, readText, writeText } from '../src/providers/file-tools.ts';

// The pieces of building a neuron that need no core: the plan as the code checks it, the file
// tools an API agent gets, and the checks a finished draft must pass.

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-build-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('the plan from the AI', () => {
  const known = new Set(['agenda']);
  const full = {
    ready: true,
    name: '  Finanças   da casa  ',
    role: 'life',
    understood: 'Gastos do mês.',
    creates: [{ name: 'Gastos', what: 'incluir' }, { what: 'no name' }],
    collections: [
      { name: 'gastos', fields: ['valor', 'data'] },
      { name: 'Bad Name!', fields: [] },
    ],
    links: [
      { neuron: 'agenda', collection: 'eventos', why: 'contas' },
      { neuron: 'ghost', collection: 'x', why: 'not a neuron' },
    ],
    checks: ['um gasto aparece'],
    limits: [],
    existing: 'ghost',
  };

  it('keeps what is right, drops what is not, and trims', () => {
    const plan = parsePlan('Here it is:\n```json\n' + JSON.stringify(full) + '\n```', known);
    expect(plan).toMatchObject({
      ready: true,
      name: 'Finanças da casa',
      creates: [{ name: 'Gastos', what: 'incluir' }],
      collections: [{ name: 'gastos', fields: ['valor', 'data'] }],
      links: [{ neuron: 'agenda', collection: 'eventos', why: 'contas' }],
      existing: null,
      questions: [],
    });
  });

  it('questions only when not ready; a ready plan needs a name and parts', () => {
    const asks = parsePlan(
      JSON.stringify({ ready: false, questions: ['a?', 'b?', 'c?', 'd?'] }),
      known,
    );
    expect(asks).toMatchObject({ ready: false, questions: ['a?', 'b?', 'c?'] });
    expect(() => parsePlan('no json at all', known)).toThrow(PlanError);
    expect(() => parsePlan('{ broken', known)).toThrow(PlanError);
    expect(() => parsePlan(JSON.stringify({ ready: true, name: 'X', creates: [] }), known)).toThrow(
      PlanError,
    );
  });

  it('the prompts carry the language, the request, the answers and the other neurons', () => {
    const p = planPrompt({
      request: 'controlar gastos',
      locale: 'pt-BR',
      exchanges: [{ kind: 'answer', text: 'só eu' }],
      neurons: [
        {
          id: 'agenda',
          name: 'Agenda',
          role: 'life',
          collections: [{ name: 'eventos', fields: ['data'] }],
        },
      ],
    });
    expect(p).toContain('Brazilian Portuguese');
    expect(p).toContain('Request:\ncontrolar gastos');
    expect(p).toContain('The owner answered:\nsó eu');
    expect(p).toContain('- agenda "Agenda" (life): eventos(data)');
    expect(PLAN_SYSTEM).toMatch(/^cerebro-plan\/1/);
    expect(BUILD_SYSTEM).toContain('/neuron-kit/cerebro.js');
    const b = buildPrompt({
      locale: 'en',
      color: 'oklch(0.78 0.11 30)',
      request: 'r',
      adjusting: false,
      plan: {
        name: 'F',
        understood: 'u',
        creates: [{ name: 'Gastos', what: 'incluir' }],
        collections: [],
        links: [full.links[0]!],
        checks: ['c'],
        limits: [],
      },
    });
    expect(b).toContain('--cb-cor: oklch(0.78 0.11 30)');
    expect(b).toContain('- agenda eventos.list: contas');
  });
});

describe('file tools for an API agent', () => {
  it('read and write only inside the folder', async () => {
    const root = path.join(dir, 'tools');
    await mkdir(root);
    expect(await writeText(root, 'js/app.js', 'x')).toBe('js/app.js');
    expect(await readText(root, 'js/app.js')).toBe('x');
    expect(await listFiles(root)).toEqual(['js/app.js']);
    await expect(writeText(root, '../escape.txt', 'x')).rejects.toThrow('outside');
    await expect(writeText(root, path.join(dir, 'abs.txt'), 'x')).rejects.toThrow('outside');
    await expect(readText(root, 'missing.txt')).rejects.toThrow('no such file');
    await expect(writeText(root, 'big.txt', 'x'.repeat(600 * 1024))).rejects.toThrow('too large');
  });

  it('a link inside the folder does not lead outside', async (ctx) => {
    const root = path.join(dir, 'linked');
    const outside = path.join(dir, 'outside');
    await mkdir(root);
    await mkdir(outside);
    try {
      await symlink(outside, path.join(root, 'door'), 'junction');
    } catch {
      ctx.skip(); // no permission to make links here
    }
    await expect(writeText(root, 'door/x.txt', 'x')).rejects.toThrow('outside');
    expect(await readdir(outside)).toEqual([]);
  });
});

describe('a finished draft', () => {
  it('needs an index.html; files the Cerebro does not serve are removed', async () => {
    const draft = path.join(dir, 'draft');
    await mkdir(path.join(draft, 'css'), { recursive: true });
    await writeFile(path.join(draft, 'notes.md'), 'x');
    await expect(checkDraft(draft)).rejects.toThrow(BuildCheckError);
    await writeFile(path.join(draft, 'index.html'), '<!doctype html>');
    await writeFile(path.join(draft, 'css', 'a.css'), 'a{}');
    await writeFile(path.join(draft, 'run.sh'), 'rm -rf /');
    expect(await checkDraft(draft)).toEqual({ files: 2, bytes: 18 });
    expect(await listFiles(draft)).toEqual(['css/a.css', 'index.html']);
  });
});

describe('the plans table', () => {
  it('a database from before the adjusting column gets it', () => {
    const file = path.join(dir, 'old.db');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE plans (id TEXT PRIMARY KEY, request TEXT NOT NULL, locale TEXT NOT NULL,
      target TEXT, status TEXT NOT NULL, exchanges TEXT NOT NULL DEFAULT '[]', plan TEXT, color TEXT,
      estimate TEXT, steps TEXT NOT NULL DEFAULT '[]', think_job TEXT, build_job TEXT,
      think_cost REAL NOT NULL DEFAULT 0, build_cost REAL, neuron TEXT, error TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, started_at INTEGER)`);
    old.close();
    const plans = new Plans(file);
    const id = plans.create('r', 'en', null);
    expect(plans.get(id)).toMatchObject({ status: 'thinking', adjusting: false });
    plans.close();
  });
});
