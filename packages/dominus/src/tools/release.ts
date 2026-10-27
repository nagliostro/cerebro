import { netGet, type NetAnswer } from '../browser/fetch.ts';
import type { Asset, Repo } from '../research/github.ts';
import { permissive } from '../research/libraries.ts';

// A GitHub program becomes a tool of the Cerebro only from what its author published: the last
// official release, one file of it made for this computer, with a SHA-256 to check it against
// (GitHub's own record of the file, or the author's list of checksums). Nothing is compiled: the
// author's build scripts never run here. A free license is a must. Choosing the file is code, no
// AI; the owner sees all of it in the plan, and only their Accept installs it.

/** The most a program's file may weigh. */
export const MAX_DOWNLOAD = 200 * 1024 * 1024;
/** The hosts a release's file comes from: GitHub, then its storage (by redirect). */
export const RELEASE_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

export class ToolError extends Error {}

export type Format = 'zip' | 'tar.gz' | 'exe' | 'binary';

/** What will be installed, pinned: this release, this file, this checksum. */
export type ToolPlan = {
  repo: string;
  tag: string;
  date: string;
  asset: { name: string; bytes: number; url: string };
  format: Format;
  sha256: string;
  /** Where the checksum came from: GitHub's record of the file, or the author's list. */
  checksum: 'github' | 'author';
  license: string;
  /** The computer it was chosen for, e.g. "windows x64". */
  system: string;
};

/** What is kept beside the installed program (tool.json): the plan, and what the test saw. */
export type ToolRecord = ToolPlan & {
  /** The program, inside tool/ (posix path). */
  program: string;
  /** The first line it answered to --version, if it did. */
  version: string | null;
  installedAt: number;
};

export type System = { platform: string; arch: string };

const OS: Record<string, RegExp> = {
  win32: /(?<![a-z])(windows|win(32|64)?)(?![a-z])|pc-windows|msvc|mingw/i,
  darwin: /darwin|mac-?os|(?<![a-z])mac(?![a-z])|osx|apple/i,
  linux: /linux/i,
};
const ARCH: Record<string, RegExp> = {
  x64: /x86[_-]?64|amd64|(?<![a-z0-9])x64(?![0-9])|win64/i,
  arm64: /arm64|aarch64/i,
};
/** 32-bit and rarer machines: never this computer. */
const OTHER_ARCH =
  /i[3-6]86|(?<![a-z0-9])(x86|386|ia32)(?![_-]?64)|armv?[5-7]|armhf|ppc|s390|riscv|mips|loong/i;
/** Files that are not a program to run: signatures, lists, packages of other systems, installers. */
const NOT_PROGRAM =
  /\.(sha\d*|md5|sig|asc|pem|sbom|spdx|json|txt|ya?ml|deb|rpm|msi|msix|dmg|pkg|apk|appimage|xz|zst|bz2|7z|vsix|whl|jar|nupkg)$|setup|installer|checksums?|sha\d+sums/i;

const formatOf = (name: string, platform: string): Format | null => {
  if (/\.zip$/i.test(name)) return 'zip';
  if (/\.(tar\.gz|tgz)$/i.test(name)) return 'tar.gz';
  if (/\.exe$/i.test(name)) return platform === 'win32' ? 'exe' : null;
  // A bare program (no extension), as Linux and macOS releases often ship one.
  if (platform !== 'win32' && !/\.[a-z0-9]{1,5}$/i.test(name)) return 'binary';
  return null;
};

const systemName = (s: System) =>
  `${{ win32: 'windows', darwin: 'macos', linux: 'linux' }[s.platform] ?? s.platform} ${s.arch}`;

/** The release's file for this computer, or null when it published none (no AI: names only). */
export function pickAsset(
  assets: Asset[],
  system: System,
): { asset: Asset; format: Format } | null {
  const mine = OS[system.platform];
  if (!mine) return null;
  let best: { asset: Asset; format: Format; score: number } | null = null;
  for (const asset of assets) {
    const name = asset.name;
    if (NOT_PROGRAM.test(name)) continue;
    const format = formatOf(name, system.platform);
    // An .exe says Windows by itself; any other file has to say it is for this system.
    if (!format || (format !== 'exe' && !mine.test(name))) continue;
    // A name that also says another system is not this one (darwin has "win" in it: see OS).
    if (Object.entries(OS).some(([p, re]) => p !== system.platform && re.test(name))) continue;
    const other = Object.entries(ARCH).some(([a, re]) => a !== system.arch && re.test(name));
    const ours = ARCH[system.arch]?.test(name) || /universal/i.test(name);
    if ((other && !ours) || (!ours && OTHER_ARCH.test(name))) continue;
    const score =
      (ours ? 4 : 0) +
      ({ zip: system.platform === 'win32' ? 2 : 1, 'tar.gz': 2, exe: 1, binary: 1 }[format] ?? 0) +
      // Windows' own toolchain, when the author built for two.
      (/msvc/i.test(name) ? 1 : 0);
    // Even, the plainest name wins: the main build, not a variant ("-stealth", "-no-render").
    if (
      !best ||
      score > best.score ||
      (score === best.score && name.length < best.asset.name.length)
    )
      best = { asset, format, score };
  }
  return best && { asset: best.asset, format: best.format };
}

type Get = (url: string) => Promise<NetAnswer>;
const fromReleases: Get = (url) => netGet(url, (host) => RELEASE_HOSTS.has(host));

/** The author's checksum of a file, from a list they published with the release. */
async function authorChecksum(assets: Asset[], file: string, get: Get): Promise<string | null> {
  const lists = assets.filter(
    (a) =>
      a.name === `${file}.sha256` ||
      /^(sha256sums|checksums)(\.txt)?$|[-_.](sha256sums|checksums)(\.txt)?$/i.test(a.name),
  );
  for (const list of lists) {
    const text = await get(list.url)
      .then((a) => (a.status === 200 ? a.body : ''))
      .catch(() => '');
    for (const line of text.split('\n')) {
      const m = line.trim().match(/^([0-9a-f]{64})(?:\s+\*?(.+))?$/i);
      // A line naming the file, or a file's own .sha256 that has only the hash.
      if (
        m &&
        (m[2]?.trim().replace(/^\.\//, '') === file || (!m[2] && list.name === `${file}.sha256`))
      )
        return m[1]!.toLowerCase();
    }
  }
  return null;
}

/** The repository's facts as kept with the request (repo.json): all but the README. */
export type RepoFacts = Omit<Repo, 'readme'>;

/**
 * What installing this repository's program would be, or why it cannot be: no free license, no
 * release, no file for this computer, too large, or no checksum to check it against.
 */
export async function planTool(
  repo: RepoFacts,
  system: System = { platform: process.platform, arch: process.arch },
  get: Get = fromReleases,
): Promise<ToolPlan> {
  if (!repo.license || !permissive(repo.license)) throw new ToolError('tool-not-free');
  if (!repo.release) throw new ToolError('tool-no-release');
  const picked = pickAsset(repo.release.assets, system);
  if (!picked) throw new ToolError('tool-no-file');
  const { asset, format } = picked;
  if (asset.bytes > MAX_DOWNLOAD) throw new ToolError('tool-too-large');
  const github = asset.digest?.match(/^sha256:([0-9a-f]{64})$/i)?.[1]?.toLowerCase();
  const sha256 = github ?? (await authorChecksum(repo.release.assets, asset.name, get));
  if (!sha256) throw new ToolError('tool-no-checksum');
  return {
    repo: `${repo.owner}/${repo.name}`,
    tag: repo.release.tag,
    date: repo.release.date,
    asset: { name: asset.name, bytes: asset.bytes, url: asset.url },
    format,
    sha256,
    checksum: github ? 'github' : 'author',
    license: repo.license,
    system: systemName(system),
  };
}
