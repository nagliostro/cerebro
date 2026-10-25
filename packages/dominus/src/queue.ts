import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { nowMs } from './clock.ts';
import type { QuotaWindow } from './providers/types.ts';

// Durable job queue in SQLite. The core is the only writer; workers report through IPC. State
// lives here, not in memory: if the core dies, a restart picks up where it stopped.

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';

export type JobRow = {
  id: string;
  type: string;
  payload: string;
  priority: number;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  max_ms: number;
  checkpoint: string | null;
  result: string | null;
  error: string | null;
  worker_pid: number | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
};

/** A job as the core shows it: JSON fields parsed, times as real-time milliseconds. */
export type Job = Omit<JobRow, 'payload' | 'checkpoint' | 'result'> & {
  payload: unknown;
  checkpoint: unknown;
  result: unknown;
};

export type NewJob = {
  type: string;
  payload?: unknown;
  priority?: number;
  maxMs?: number;
  maxAttempts?: number;
};

export type StoredQuota = QuotaWindow & { measuredAt: number };

const parse = (s: string | null) => (s === null ? null : (JSON.parse(s) as unknown));

export function toJob(row: JobRow): Job {
  return {
    ...row,
    payload: parse(row.payload),
    checkpoint: parse(row.checkpoint),
    result: parse(row.result),
  };
}

export class Queue {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 2000;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        max_ms INTEGER NOT NULL DEFAULT 600000,
        checkpoint TEXT,
        result TEXT,
        error TEXT,
        worker_pid INTEGER,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS jobs_pending ON jobs (status, priority DESC, created_at);
      CREATE TABLE IF NOT EXISTS quota (
        provider TEXT NOT NULL,
        window TEXT NOT NULL,
        used REAL NOT NULL,
        resets_at TEXT,
        source TEXT NOT NULL,
        blocked INTEGER NOT NULL,
        measured_at INTEGER NOT NULL,
        PRIMARY KEY (provider, window)
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  close() {
    this.db.close();
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string) {
    this.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run(key, value);
  }

  /** Latest reading per provider and window, already normalized by the provider's adapter. */
  saveQuota(provider: string, windows: QuotaWindow[]) {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO quota (provider, window, used, resets_at, source, blocked, measured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const w of windows)
      stmt.run(provider, w.name, w.used, w.resetsAt, w.source, w.blocked ? 1 : 0, nowMs());
  }

  quota(provider: string): StoredQuota[] {
    const rows = this.db.prepare(`SELECT * FROM quota WHERE provider = ?`).all(provider) as {
      window: QuotaWindow['name'];
      used: number;
      resets_at: string | null;
      source: QuotaWindow['source'];
      blocked: number;
      measured_at: number;
    }[];
    return rows.map((r) => ({
      name: r.window,
      used: r.used,
      resetsAt: r.resets_at,
      source: r.source,
      blocked: !!r.blocked,
      measuredAt: r.measured_at,
    }));
  }

  /** What the Dominus itself spent through this provider since `since` (its own count, no AI). */
  spent(provider: string, since: number) {
    return this.db
      .prepare(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(json_extract(result, '$.costUsd')), 0) AS usd,
                COALESCE(SUM(json_extract(result, '$.inputTokens') + json_extract(result, '$.outputTokens')), 0) AS tokens
         FROM jobs WHERE type = 'ask' AND status = 'done'
           AND json_extract(payload, '$.provider') = ? AND finished_at >= ?`,
      )
      .get(provider, since) as { calls: number; usd: number; tokens: number };
  }

  enqueue(job: NewJob) {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO jobs (id, type, payload, priority, max_ms, max_attempts, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        job.type,
        JSON.stringify(job.payload ?? {}),
        job.priority ?? 0,
        job.maxMs ?? 600_000,
        job.maxAttempts ?? 3,
        nowMs(),
      );
    return id;
  }

  /** Atomically takes the next queued job (highest priority, then oldest). */
  claim(): JobRow | null {
    const row = this.db
      .prepare(
        `UPDATE jobs SET status = 'running', attempts = attempts + 1, started_at = ?
         WHERE id = (SELECT id FROM jobs WHERE status = 'queued'
                     ORDER BY priority DESC, created_at LIMIT 1)
         RETURNING *`,
      )
      .get(nowMs());
    return (row as JobRow | undefined) ?? null;
  }

  setWorker(id: string, pid: number) {
    this.db.prepare(`UPDATE jobs SET worker_pid = ? WHERE id = ?`).run(pid, id);
  }

  saveCheckpoint(id: string, checkpoint: unknown) {
    this.db
      .prepare(`UPDATE jobs SET checkpoint = ? WHERE id = ? AND status = 'running'`)
      .run(JSON.stringify(checkpoint), id);
  }

  finish(
    id: string,
    status: 'done' | 'failed' | 'canceled',
    data: { result?: unknown; error?: string },
  ) {
    this.db
      .prepare(
        `UPDATE jobs SET status = ?, result = ?, error = ?, finished_at = ?, worker_pid = NULL
         WHERE id = ? AND status = 'running'`,
      )
      .run(
        status,
        data.result === undefined ? null : JSON.stringify(data.result),
        data.error ?? null,
        nowMs(),
        id,
      );
  }

  /** A worker died: back to the queue (keeping the checkpoint) or failed after too many tries. */
  retryOrFail(id: string, error: string) {
    const job = this.get(id);
    if (!job || job.status !== 'running') return;
    if (job.attempts >= job.max_attempts) this.finish(id, 'failed', { error });
    else
      this.db
        .prepare(`UPDATE jobs SET status = 'queued', worker_pid = NULL, error = ? WHERE id = ?`)
        .run(error, id);
  }

  /** On core start: jobs left "running" by a previous core go back to the queue. */
  recover() {
    const rows = this.db.prepare(`SELECT id FROM jobs WHERE status = 'running'`).all() as {
      id: string;
    }[];
    for (const r of rows) this.retryOrFail(r.id, 'core restarted');
    return rows.length;
  }

  cancelQueued(id: string) {
    return (
      this.db
        .prepare(
          `UPDATE jobs SET status = 'canceled', finished_at = ? WHERE id = ? AND status = 'queued'`,
        )
        .run(nowMs(), id).changes > 0
    );
  }

  get(id: string) {
    return (
      (this.db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as JobRow | undefined) ?? null
    );
  }

  /** The most recent jobs first. */
  list(limit = 50) {
    return this.db
      .prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as JobRow[];
  }
}
