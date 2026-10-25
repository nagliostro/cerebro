import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checkLibrary,
  LibraryError,
  permissive,
  vendorLibrary,
} from '../src/research/libraries.ts';

// Free libraries a neuron carries: only permissive licenses, only what the market uses, and the
// file checked against the registry's own integrity hash. The online part needs the internet.

describe('licenses', () => {
  it('lets in only permissive ones, and a choice that includes one', () => {
    for (const l of ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause', '(MIT OR GPL-3.0-or-later)'])
      expect(permissive(l), l).toBe(true);
    for (const l of [
      'GPL-3.0',
      'AGPL-3.0',
      'MIT AND GPL-3.0',
      'SEE LICENSE IN LICENSE',
      'UNLICENSED',
      '',
    ])
      expect(permissive(l), l).toBe(false);
  });
});

const online = await fetch('https://registry.npmjs.org/-/ping', {
  signal: AbortSignal.timeout(5000),
})
  .then((r) => r.ok)
  .catch(() => false);

describe.skipIf(!online)('on the npm registry', () => {
  it('a known library passes, with its browser file; an unknown or tiny one does not', async () => {
    const lib = await checkLibrary('pdf-lib', 'split PDFs');
    expect(lib).toMatchObject({
      name: 'pdf-lib',
      license: 'MIT',
      file: expect.stringMatching(/\.js$/),
    });
    expect(lib.weekly).toBeGreaterThan(10_000);
    await expect(checkLibrary('surely-not-a-package-cerebro-xyz', '')).rejects.toBeInstanceOf(
      LibraryError,
    );
    await expect(checkLibrary('../etc/passwd', '')).rejects.toThrow(/not an npm package name/);
  }, 60_000);

  it('is carried inside the application, checked against its integrity hash, with its license', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-vendor-'));
    const lib = await checkLibrary('jszip', 'make ZIP files');
    const file = await vendorLibrary(dir, lib);
    expect(file).toMatch(/^vendor\/jszip\/.+\.js$/);
    expect((await readFile(path.join(dir, file), 'utf8')).length).toBeGreaterThan(10_000);
    expect(await readFile(path.join(dir, 'vendor', 'jszip', 'LICENSE.txt'), 'utf8')).toMatch(/MIT/);
    await rm(dir, { recursive: true, force: true });
  }, 60_000);
});
