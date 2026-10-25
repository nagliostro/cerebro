import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setOffset } from '../src/clock.ts';
import { Queue } from '../src/queue.ts';

let dir: string;
let queue: Queue;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-queue-'));
  queue = new Queue(path.join(dir, 'q.db'));
});
afterEach(async () => {
  queue.close();
  setOffset(0);
  await rm(dir, { recursive: true, force: true });
});

describe('queue', () => {
  it('takes the highest priority first, then the oldest', () => {
    const low = queue.enqueue({ type: 'a', priority: 0 });
    const high = queue.enqueue({ type: 'a', priority: 5 });
    expect(queue.claim()?.id).toBe(high);
    expect(queue.claim()?.id).toBe(low);
    expect(queue.claim()).toBeNull();
  });

  it('gives a job back with its checkpoint, until the attempts run out', () => {
    const id = queue.enqueue({ type: 'a', maxAttempts: 2 });
    queue.claim();
    queue.saveCheckpoint(id, { step: 3 });
    queue.retryOrFail(id, 'worker died');
    expect(queue.get(id)).toMatchObject({ status: 'queued', checkpoint: '{"step":3}' });
    queue.claim();
    queue.retryOrFail(id, 'worker died again');
    expect(queue.get(id)).toMatchObject({ status: 'failed', error: 'worker died again' });
  });

  it('puts back what a dead core left running', () => {
    const id = queue.enqueue({ type: 'a' });
    queue.claim();
    expect(queue.recover()).toBe(1);
    expect(queue.get(id)?.status).toBe('queued');
  });

  it('stamps jobs with the Dominus clock, not the computer clock', () => {
    setOffset(3 * 86_400_000); // the computer is three days behind
    const id = queue.enqueue({ type: 'a' });
    expect(queue.get(id)!.created_at - Date.now()).toBeGreaterThan(3 * 86_400_000 - 1000);
  });
});
