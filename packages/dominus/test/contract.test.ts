import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Contracts } from '../src/contract.ts';

let dir: string;
let c: Contracts;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-contract-'));
  c = new Contracts(path.join(dir, 'c.db'));
});
afterEach(async () => {
  c.close();
  await rm(dir, { recursive: true, force: true });
});

describe('contract', () => {
  it('keeps a neuron’s records by collection: create, list, get, update, delete', () => {
    const r = c.run('financas', 'gastos', 'create', {
      data: { desc: 'Mercado', valor: 312.4 },
    }) as {
      id: string;
    };
    expect(c.run('financas', 'gastos', 'list', {})).toMatchObject([
      { id: r.id, data: { desc: 'Mercado' } },
    ]);
    c.run('financas', 'gastos', 'update', { id: r.id, data: { desc: 'Feira', valor: 80 } });
    expect(c.run('financas', 'gastos', 'get', { id: r.id })).toMatchObject({
      data: { desc: 'Feira' },
    });
    expect(c.run('financas', 'gastos', 'delete', { id: r.id })).toEqual({ deleted: true });
    expect(c.run('financas', 'gastos', 'list', {})).toEqual([]);
    // Another neuron's data is apart.
    expect(c.run('agenda', 'gastos', 'list', {})).toEqual([]);
  });

  it('refuses odd input', () => {
    expect(() => c.run('financas', '../x', 'list', {})).toThrow('invalid collection');
    expect(() => c.run('financas', 'gastos', 'drop', {})).toThrow('invalid operation');
    expect(() => c.run('financas', 'gastos', 'create', { data: [1] })).toThrow('object');
    expect(() =>
      c.run('financas', 'gastos', 'create', { data: { x: 'a'.repeat(70_000) } }),
    ).toThrow('too large');
    expect(() => c.run('financas', 'gastos', 'get', { id: 'nope' })).toThrow('not found');
  });

  it('generates the contract from the data: fields and operations, empty collections hidden', () => {
    expect(c.contract('financas')).toEqual({ neuron: 'financas', collections: [] });
    c.run('financas', 'gastos', 'create', { data: { desc: 'Mercado', valor: 312.4, pago: true } });
    expect(c.contract('financas').collections).toEqual([
      {
        name: 'gastos',
        count: 1,
        fields: [
          { name: 'desc', type: 'string' },
          { name: 'valor', type: 'number' },
          { name: 'pago', type: 'boolean' },
        ],
        operations: ['list', 'get', 'create', 'update', 'delete'],
      },
    ]);
  });

  it('allows only what the owner granted, by pair, collection and operation', () => {
    expect(c.allowed('agenda', 'financas', 'gastos', 'list')).toBe(false);
    c.setPermission('financas', 'agenda', 'gastos', ['view']);
    expect(c.allowed('agenda', 'financas', 'gastos', 'list')).toBe(true);
    expect(c.allowed('agenda', 'financas', 'gastos', 'get')).toBe(true);
    expect(c.allowed('agenda', 'financas', 'gastos', 'create')).toBe(false);
    expect(c.allowed('agenda', 'financas', 'contas', 'list')).toBe(false);
    expect(c.allowed('financas', 'agenda', 'gastos', 'list')).toBe(false); // not the other way
    c.setPermission('financas', 'agenda', 'gastos', ['create', 'view']);
    expect(c.permissions('financas')).toEqual([
      { caller: 'agenda', collection: 'gastos', grants: ['view', 'create'] },
    ]);
    c.revokeAll('financas');
    expect(c.permissions('financas')).toEqual([]);
    expect(() => c.setPermission('financas', 'financas', 'gastos', ['view'])).toThrow('caller');
    expect(() => c.setPermission('financas', 'agenda', 'gastos', ['all'])).toThrow('grants');
  });
});
