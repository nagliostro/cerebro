import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

import { create } from 'tar';
import { afterEach, describe, expect, it } from 'vitest';

import type { Asset } from '../src/research/github.ts';
import {
  findProgram,
  inside,
  installTool,
  isToolJob,
  smoke,
  untar,
  unzip,
} from '../src/tools/install.ts';
import { pickAsset, planTool, type RepoFacts } from '../src/tools/release.ts';

// Production: a GitHub program installed from its author's last release, pinned to one file and
// its SHA-256, unpacked with nothing leaving its folder, and run once to see it works. GitHub's
// answers and the downloads are given here; the program run is Node itself.

const WIN = { platform: 'win32', arch: 'x64' };
const LINUX = { platform: 'linux', arch: 'x64' };
const MAC = { platform: 'darwin', arch: 'arm64' };

const base = 'https://github.com/o/r/releases/download/v1';
const asset = (name: string, extra: Partial<Asset> = {}): Asset => ({
  name,
  bytes: 1000,
  url: `${base}/${name}`,
  digest: `sha256:${'a'.repeat(64)}`,
  ...extra,
});
const pick = (names: string[], system: { platform: string; arch: string }) =>
  pickAsset(
    names.map((n) => asset(n)),
    system,
  )?.asset.name ?? null;

/** A zip as the release would have it (deflated, Unix modes). */
function zip(entries: { name: string; data?: string; mode?: number }[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.from(e.data ?? '');
    const packed = deflateRawSync(data);
    const name = Buffer.from(e.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((e.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += 30 + name.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const dirs: string[] = [];
const temp = async () => {
  const d = await mkdtemp(path.join(tmpdir(), 'cerebro-tool-'));
  dirs.push(d);
  return d;
};
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

describe('a release file for this computer', () => {
  it('is chosen by its name: this system, this machine, the main build', () => {
    const obscura = ['stealth', 'no-render', 'no-render-stealth', ''].flatMap((v) =>
      ['x86_64-windows.zip', 'x86_64-linux.tar.gz', 'aarch64-macos.tar.gz'].map((s) =>
        v ? `obscura-${s.replace(/\.(zip|tar\.gz)$/, `-${v}.$1`)}` : `obscura-${s}`,
      ),
    );
    expect(pick(obscura, WIN)).toBe('obscura-x86_64-windows.zip');
    expect(pick(obscura, LINUX)).toBe('obscura-x86_64-linux.tar.gz');
    expect(pick(obscura, MAC)).toBe('obscura-aarch64-macos.tar.gz');
    const rg = [
      'rg-x86_64-pc-windows-gnu.zip',
      'rg-x86_64-pc-windows-msvc.zip',
      'rg-i686-pc-windows-msvc.zip',
      'rg-x86_64-apple-darwin.tar.gz',
      'rg-x86_64-pc-windows-msvc.zip.sha256',
    ];
    expect(pick(rg, WIN)).toBe('rg-x86_64-pc-windows-msvc.zip');
    // "darwin" has "win" in it: never taken for Windows; and no arm64 build is no build.
    expect(pick(['rg-x86_64-apple-darwin.tar.gz'], WIN)).toBeNull();
    expect(pick(['rg-x86_64-apple-darwin.tar.gz'], MAC)).toBeNull();
    // 32-bit, installers, packages of other systems: never.
    expect(pick(['t-win32-ia32.zip', 't-setup-x64.exe', 't-amd64.msi'], WIN)).toBeNull();
    // An .exe says Windows by itself; a bare program is Linux's or macOS's way.
    expect(pick(['jq-win64.exe', 'jq-linux-amd64', 'jq-macos-arm64'], WIN)).toBe('jq-win64.exe');
    expect(pick(['jq-win64.exe', 'jq-linux-amd64', 'jq-macos-arm64'], LINUX)).toBe(
      'jq-linux-amd64',
    );
    expect(pick(['jq-win64.exe', 'jq-linux-amd64', 'jq-macos-arm64'], MAC)).toBe('jq-macos-arm64');
  });

  const facts = (assets: Asset[], license: string | null = 'MIT'): RepoFacts => ({
    owner: 'o',
    name: 'r',
    url: 'https://github.com/o/r',
    description: '',
    language: 'Rust',
    license,
    stars: 1,
    archived: false,
    topics: [],
    release: { tag: 'v1', date: '2026-10-01', assets },
  });

  it('is planned pinned to its checksum, or not at all, saying why', async () => {
    const plan = await planTool(facts([asset('r-x86_64-windows.zip')]), WIN);
    expect(plan).toMatchObject({
      repo: 'o/r',
      tag: 'v1',
      asset: { name: 'r-x86_64-windows.zip', url: `${base}/r-x86_64-windows.zip` },
      format: 'zip',
      sha256: 'a'.repeat(64),
      checksum: 'github',
      license: 'MIT',
      system: 'windows x64',
    });
    const fails = async (f: RepoFacts) => (await planTool(f, WIN).catch((e) => e)).message;
    expect(await fails(facts([asset('r-x86_64-windows.zip')], 'GPL-3.0'))).toBe('tool-not-free');
    expect(await fails(facts([asset('r-x86_64-windows.zip')], null))).toBe('tool-not-free');
    expect(await fails({ ...facts([]), release: null })).toBe('tool-no-release');
    expect(await fails(facts([asset('r-linux.tar.gz')]))).toBe('tool-no-file');
    expect(await fails(facts([asset('r-windows.zip', { bytes: 300 * 1024 * 1024 })]))).toBe(
      'tool-too-large',
    );
    // No checksum from GitHub and none from the author: nothing to check it against.
    const bare = asset('r-windows.zip', { digest: null });
    expect(
      await planTool(facts([bare]), WIN, async () => ({
        status: 404,
        type: '',
        body: '',
        url: '',
      })).catch((e) => e.message),
    ).toBe('tool-no-checksum');
  });

  it("takes the author's checksum list when GitHub has none", async () => {
    const bare = asset('r-windows.zip', { digest: null });
    const list = asset('SHA256SUMS', { digest: null });
    const asked: string[] = [];
    const plan = await planTool(facts([bare, list]), WIN, async (url) => {
      asked.push(url);
      return {
        status: 200,
        type: 'text/plain',
        body: `${'b'.repeat(64)}  r-linux.tar.gz\n${'C'.repeat(64)} *r-windows.zip\n`,
        url,
      };
    });
    expect(asked).toEqual([`${base}/SHA256SUMS`]);
    expect(plan).toMatchObject({ sha256: 'c'.repeat(64), checksum: 'author' });
  });
});

describe('installing it', () => {
  it('keeps every file inside its folder', () => {
    const root = path.resolve('/x/tool');
    expect(inside(root, 'bin/r.exe')).toBe(path.join(root, 'bin', 'r.exe'));
    expect(inside(root, './r')).toBe(path.join(root, 'r'));
    for (const bad of ['../r', 'a/../../r', '/etc/passwd', 'C:\\Windows\\r', 'a\\..\\..\\r', ''])
      expect(inside(root, bad), bad).toBeNull();
  });

  it('unpacks a zip, skips its links, and refuses one that leaves the folder', async () => {
    const root = path.join(await temp(), 'tool');
    const t = await unzip(
      zip([
        { name: 'r/', mode: 0o40755 },
        { name: 'r/r.exe', data: 'program', mode: 0o100755 },
        { name: 'r/README.md', data: 'read me' },
        { name: 'r/link', data: '/etc/passwd', mode: 0o120777 },
      ]),
      root,
    );
    expect(t.files).toBe(2);
    expect(await readFile(path.join(root, 'r', 'r.exe'), 'utf8')).toBe('program');
    expect((await readdir(path.join(root, 'r'))).sort()).toEqual(['README.md', 'r.exe']);
    await expect(unzip(zip([{ name: '../evil', data: 'x' }]), root)).rejects.toThrow(
      'tool-bad-archive',
    );
    await expect(unzip(Buffer.from('not a zip at all, not even close'), root)).rejects.toThrow(
      'tool-bad-archive',
    );
  });

  it('unpacks a .tar.gz with files only', async () => {
    const src = await temp();
    await mkdir(path.join(src, 'r-1.0'));
    await writeFile(path.join(src, 'r-1.0', 'r'), '#!/bin/sh\necho 1', { mode: 0o755 });
    await writeFile(path.join(src, 'r-1.0', 'LICENSE'), 'MIT');
    // Links need a privilege on Windows: tried, and left out when the system says no.
    await symlink('/etc/passwd', path.join(src, 'r-1.0', 'link')).catch(() => undefined);
    const file = path.join(await temp(), 'r.tar.gz');
    await create({ gzip: true, file, cwd: src }, ['r-1.0']);
    const root = path.join(await temp(), 'tool');
    const t = await untar(file, root);
    expect(t.files).toBe(2);
    expect((await readdir(path.join(root, 'r-1.0'))).sort()).toEqual(['LICENSE', 'r']);
  });

  it('finds the program by its name, or the only one there is', async () => {
    const root = await temp();
    const program = process.platform === 'win32' ? '.exe' : '';
    await mkdir(path.join(root, 'bin'));
    for (const f of [`bin/r${program}`, `bin/helper${program}`, 'README.md'])
      await writeFile(path.join(root, f), 'x', { mode: 0o755 });
    expect(await findProgram(root, ['r'])).toBe(`bin/r${program}`);
    expect(await findProgram(root, ['other'])).toBeNull();
    await rm(path.join(root, 'bin', `helper${program}`));
    expect(await findProgram(root, ['other'])).toBe(`bin/r${program}`);
  });

  it('runs the program once: it answers --version', async () => {
    // Node itself stands for the program.
    const r = await smoke(process.execPath);
    expect(r).toEqual({ smoke: 'version', version: process.version });
  });

  it('downloads, checks the SHA-256, unpacks and tests; a different file stops it', async () => {
    const exe = process.platform === 'win32' ? 'r.exe' : 'r';
    const archive = zip([
      { name: `r-1.0/${exe}`, data: 'program', mode: 0o100755 },
      { name: 'r-1.0/LICENSE', data: 'MIT' },
    ]);
    const sha256 = createHash('sha256').update(archive).digest('hex');
    const job = {
      dir: await temp(),
      url: `${base}/r-windows.zip`,
      sha256,
      bytes: archive.length,
      format: 'zip' as const,
      asset: 'r-windows.zip',
      hints: ['r'],
    };
    expect(isToolJob(job)).toBe(true);
    expect(isToolJob({ ...job, url: 'https://evil.example/r.zip' })).toBe(false);
    expect(isToolJob({ ...job, sha256: 'x' })).toBe(false);
    const tested: string[] = [];
    const deps = {
      download: async (url: string, file: string) => {
        expect(url).toBe(job.url);
        await writeFile(file, archive);
        return { bytes: archive.length, sha256 };
      },
      smoke: async (program: string) => {
        tested.push(program);
        return { smoke: 'version' as const, version: 'r 1.0' };
      },
    };
    expect(await installTool(job, deps)).toEqual({
      program: `r-1.0/${exe}`,
      smoke: 'version',
      version: 'r 1.0',
      files: 2,
      bytes: 10,
    });
    expect(tested).toEqual([path.join(job.dir, 'tool', 'r-1.0', exe)]);
    // The download is gone; only the program's folder stays in the draft.
    expect(await readdir(job.dir)).toEqual(['tool']);
    await expect(
      installTool(job, {
        ...deps,
        download: async (_u, file) => {
          await writeFile(file, 'something else');
          return { bytes: archive.length, sha256: 'f'.repeat(64) };
        },
      }),
    ).rejects.toThrow('tool-checksum-mismatch');
  });
});
