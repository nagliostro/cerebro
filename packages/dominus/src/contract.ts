import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { nowMs } from './clock.ts';

// The contract between neurons, with no AI and no tokens. Each neuron keeps its data in
// collections of records; its contract (generated from the data itself, never written by hand)
// says which collections it has, their fields and the operations on each. One neuron asks
// another for an operation only if the owner allowed that pair, collection and operation; the
// core checks, validates and runs it. A neuron's own data needs no permission.

export const OPERATIONS = ['list', 'get', 'create', 'update', 'delete'] as const;
export type Operation = (typeof OPERATIONS)[number];
/** What the owner allows: reading covers list and get. */
export const GRANTS = ['view', 'create', 'update', 'delete'] as const;
export type Grant = (typeof GRANTS)[number];
const grantOf = (op: Operation): Grant => (op === 'list' || op === 'get' ? 'view' : op);

export type RecordRow = {
  id: string;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};
export type Field = { name: string; type: string };
export type Contract = {
  neuron: string;
  collections: { name: string; count: number; fields: Field[]; operations: Operation[] }[];
};
export type Permission = { caller: string; collection: string; grants: Grant[] };

const COLLECTION = /^[a-z][a-z0-9_-]{0,31}$/;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_LIST = 500;

export class ContractError extends Error {}

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

export class Contracts {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 2000;
      CREATE TABLE IF NOT EXISTS records (
        neuron TEXT NOT NULL,
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (neuron, collection, id)
      );
      CREATE TABLE IF NOT EXISTS permissions (
        target TEXT NOT NULL,
        caller TEXT NOT NULL,
        collection TEXT NOT NULL,
        grant_ TEXT NOT NULL,
        PRIMARY KEY (target, caller, collection, grant_)
      );
    `);
  }

  close() {
    this.db.close();
  }

  /** Runs an operation on a neuron's own data. */
  run(neuron: string, collection: unknown, op: unknown, input: unknown): unknown {
    if (typeof collection !== 'string' || !COLLECTION.test(collection))
      throw new ContractError('invalid collection');
    if (!OPERATIONS.includes(op as Operation)) throw new ContractError('invalid operation');
    const i = (input ?? {}) as { id?: unknown; data?: unknown };
    const id = typeof i.id === 'string' && i.id.length <= 64 ? i.id : null;
    const data = (): Record<string, unknown> => {
      if (!i.data || typeof i.data !== 'object' || Array.isArray(i.data))
        throw new ContractError('data must be an object');
      const json = JSON.stringify(i.data);
      if (json.length > MAX_RECORD_BYTES) throw new ContractError('record too large');
      return JSON.parse(json);
    };
    const now = nowMs();
    switch (op as Operation) {
      case 'list':
        return (
          this.db
            .prepare(
              `SELECT id, data, created_at, updated_at FROM records
               WHERE neuron = ? AND collection = ? ORDER BY created_at DESC LIMIT ?`,
            )
            .all(neuron, collection, MAX_LIST) as {
            id: string;
            data: string;
            created_at: number;
            updated_at: number;
          }[]
        ).map((r) => ({
          id: r.id,
          data: JSON.parse(r.data),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
      case 'get': {
        if (!id) throw new ContractError('id required');
        const r = this.db
          .prepare(
            `SELECT data, created_at, updated_at FROM records WHERE neuron = ? AND collection = ? AND id = ?`,
          )
          .get(neuron, collection, id) as
          { data: string; created_at: number; updated_at: number } | undefined;
        if (!r) throw new ContractError('not found');
        return { id, data: JSON.parse(r.data), createdAt: r.created_at, updatedAt: r.updated_at };
      }
      case 'create': {
        const newId = randomUUID();
        const d = data();
        this.db
          .prepare(
            `INSERT INTO records (neuron, collection, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(neuron, collection, newId, JSON.stringify(d), now, now);
        return { id: newId, data: d, createdAt: now, updatedAt: now };
      }
      case 'update': {
        if (!id) throw new ContractError('id required');
        const d = data();
        const changed = this.db
          .prepare(
            `UPDATE records SET data = ?, updated_at = ? WHERE neuron = ? AND collection = ? AND id = ?`,
          )
          .run(JSON.stringify(d), now, neuron, collection, id).changes;
        if (!changed) throw new ContractError('not found');
        return { id, data: d, updatedAt: now };
      }
      case 'delete': {
        if (!id) throw new ContractError('id required');
        const changed = this.db
          .prepare(`DELETE FROM records WHERE neuron = ? AND collection = ? AND id = ?`)
          .run(neuron, collection, id).changes;
        return { deleted: changed > 0 };
      }
    }
  }

  /** May `caller` run `op` on `target`'s collection? Only what the owner allowed. */
  allowed(caller: string, target: string, collection: string, op: Operation) {
    return !!this.db
      .prepare(
        `SELECT 1 FROM permissions WHERE target = ? AND caller = ? AND collection = ? AND grant_ = ?`,
      )
      .get(target, caller, collection, grantOf(op));
  }

  /** The contract: generated from the data, so it is always true. Empty collections do not show. */
  contract(neuron: string): Contract {
    const rows = this.db
      .prepare(`SELECT collection, data FROM records WHERE neuron = ? ORDER BY collection`)
      .all(neuron) as { collection: string; data: string }[];
    const byCollection = new Map<string, { count: number; fields: Map<string, string> }>();
    for (const r of rows) {
      const c = byCollection.get(r.collection) ?? { count: 0, fields: new Map() };
      c.count++;
      for (const [k, v] of Object.entries(JSON.parse(r.data) as Record<string, unknown>))
        if (!c.fields.has(k) && v !== null) c.fields.set(k, typeOf(v));
      byCollection.set(r.collection, c);
    }
    return {
      neuron,
      collections: [...byCollection].map(([name, c]) => ({
        name,
        count: c.count,
        fields: [...c.fields].map(([n, type]) => ({ name: n, type })),
        operations: [...OPERATIONS],
      })),
    };
  }

  /** Who may ask what of `target`, by caller and collection. */
  permissions(target: string): Permission[] {
    const rows = this.db
      .prepare(
        `SELECT caller, collection, grant_ FROM permissions WHERE target = ? ORDER BY caller, collection`,
      )
      .all(target) as { caller: string; collection: string; grant_: Grant }[];
    const out = new Map<string, Permission>();
    for (const r of rows) {
      const k = `${r.caller}|${r.collection}`;
      const p = out.get(k) ?? { caller: r.caller, collection: r.collection, grants: [] };
      p.grants.push(r.grant_);
      out.set(k, p);
    }
    return [...out.values()].map((p) => ({
      ...p,
      grants: GRANTS.filter((g) => p.grants.includes(g)),
    }));
  }

  /** Sets exactly these grants for one caller and collection (none removes the pair). */
  setPermission(target: string, caller: unknown, collection: unknown, grants: unknown) {
    if (typeof caller !== 'string' || caller === target) throw new ContractError('invalid caller');
    if (typeof collection !== 'string' || !COLLECTION.test(collection))
      throw new ContractError('invalid collection');
    if (!Array.isArray(grants) || !grants.every((g) => GRANTS.includes(g)))
      throw new ContractError('invalid grants');
    this.db
      .prepare(`DELETE FROM permissions WHERE target = ? AND caller = ? AND collection = ?`)
      .run(target, caller, collection);
    const add = this.db.prepare(
      `INSERT OR IGNORE INTO permissions (target, caller, collection, grant_) VALUES (?, ?, ?, ?)`,
    );
    for (const g of grants as Grant[]) add.run(target, caller, collection, g);
  }

  revokeAll(target: string) {
    this.db.prepare(`DELETE FROM permissions WHERE target = ?`).run(target);
  }
}
