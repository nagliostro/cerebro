import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  AttachmentError,
  attachmentLines,
  listAttachments,
  readAttachment,
  saveUploads,
  takeUploads,
} from '../src/research/attachments.ts';

// What the owner attaches to a request: kept by the screen, taken by the core into the research.

const dir = mkdtempSync(path.join(os.tmpdir(), 'cerebro-attach-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

describe('attachments', () => {
  it('keeps pictures and texts under clean names, and the core takes them', async () => {
    const upload = await saveUploads(dir, [
      { name: '../../print do google.png', data: PNG },
      { name: 'notas.txt', data: Buffer.from('1 USD = 5,45 BRL') },
    ]);
    const research = path.join(dir, 'research', 'p1');
    await takeUploads(dir, upload, research);
    expect(readdirSync(path.join(dir, 'uploads'))).toEqual([]);
    expect(await listAttachments(research)).toEqual([
      { name: 'notas.txt', kind: 'text', bytes: 16 },
      { name: 'print-do-google.png', kind: 'image', bytes: PNG.length },
    ]);
    expect(await readAttachment(research, 'print-do-google.png')).toMatchObject({
      kind: 'image',
      mime: 'image/png',
    });
    const lines = (await attachmentLines(research)).join('\n');
    expect(lines).toContain('print-do-google.png (image)');
    expect(lines).toContain('1 USD = 5,45 BRL');
    await expect(readAttachment(research, '../notas.txt')).rejects.toBeInstanceOf(AttachmentError);
  });

  it('adds a later upload (an answer with a drawing) beside the first, under free names', async () => {
    const research = path.join(dir, 'research', 'p2');
    await takeUploads(dir, await saveUploads(dir, [{ name: 'tela.png', data: PNG }]), research);
    const later = await saveUploads(dir, [{ name: 'tela.png', data: PNG }]);
    expect(await takeUploads(dir, later, research)).toEqual(['tela-2.png']);
    expect((await listAttachments(research)).map((a) => a.name)).toEqual([
      'tela-2.png',
      'tela.png',
    ]);
    expect(readdirSync(path.join(dir, 'uploads'))).toEqual([]);
  });

  it('refuses what is not what it says, other kinds, and unknown uploads', async () => {
    await expect(
      saveUploads(dir, [{ name: 'x.png', data: Buffer.from('<script>') }]),
    ).rejects.toThrow(/not the image/);
    await expect(saveUploads(dir, [{ name: 'run.exe', data: Buffer.from('MZ') }])).rejects.toThrow(
      /only images/,
    );
    await expect(saveUploads(dir, [])).rejects.toThrow(/no files/);
    await expect(takeUploads(dir, '../../etc', path.join(dir, 'r'))).rejects.toThrow(/unknown/);
  });
});
