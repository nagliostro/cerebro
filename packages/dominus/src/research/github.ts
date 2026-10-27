import { netGet, type NetAnswer } from '../browser/fetch.ts';
import { permissive } from './libraries.ts';

// A link to a GitHub repository needs no Navegador: the repository describes itself. Its public
// API, with no key, says what it is (description, language, license, stars), its last official
// release and its README. Read through the same guard as everything else, only from the API's
// own host, with a size and a time limit. What comes back is third-party text: data, never
// instructions.

const API = 'https://api.github.com';
/** The first part of the README is enough to say what the project is. */
export const README_CHARS = 6000;

/** Paths of github.com that are pages of GitHub itself, not someone's repository. */
const NOT_OWNERS = new Set([
  'about',
  'apps',
  'collections',
  'enterprise',
  'explore',
  'features',
  'login',
  'marketplace',
  'new',
  'notifications',
  'orgs',
  'pricing',
  'search',
  'settings',
  'signup',
  'sponsors',
  'topics',
  'trending',
]);

export class RepoError extends Error {}

export type Repo = {
  owner: string;
  name: string;
  url: string;
  description: string;
  language: string | null;
  /** The SPDX id GitHub found, or null when it found none it knows. */
  license: string | null;
  stars: number;
  archived: boolean;
  topics: string[];
  /** The last release the author published, if any. */
  release: { tag: string; date: string; assets: Asset[] } | null;
  readme: string;
};

/** A file of a release: where GitHub serves it and, when GitHub keeps one, its SHA-256. */
export type Asset = { name: string; bytes: number; url: string; digest: string | null };

/** The repository a link points at (github.com/owner/name/...), or null when it is not one. */
export function githubRepo(link: string): { owner: string; name: string } | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null;
  const [owner, raw] = url.pathname.split('/').filter(Boolean);
  const name = raw?.replace(/\.git$/i, '');
  if (!owner || !name || NOT_OWNERS.has(owner.toLowerCase())) return null;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || /^\.+$/.test(name)) return null;
  return { owner, name };
}

type Get = (url: string) => Promise<NetAnswer>;
const fromApi: Get = (url) => netGet(url, (host) => host === 'api.github.com');

const json = (a: NetAnswer) => {
  try {
    return JSON.parse(a.body) as Record<string, unknown>;
  } catch {
    throw new RepoError('github-busy: the answer did not parse');
  }
};
const str = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';

/** Reads a repository; `get` is the guarded GET (a test gives its own). */
export async function readRepo(
  repo: { owner: string; name: string },
  get: Get = fromApi,
): Promise<Repo> {
  const base = `${API}/repos/${repo.owner}/${repo.name}`;
  const info = await get(base);
  if (info.status === 404) throw new RepoError('repo-missing');
  // 403 and 429 are the limit of asks without a key (60 an hour); anything else, GitHub's day.
  if (info.status !== 200) throw new RepoError(`github-busy: ${info.status}`);
  const r = json(info);
  if (r.private === true) throw new RepoError('repo-missing');
  const license = (r.license as { spdx_id?: unknown } | null)?.spdx_id;
  const [release, readme] = await Promise.all([
    get(`${base}/releases/latest`).catch(() => null),
    get(`${base}/readme`).catch(() => null),
  ]);
  const github = `https://github.com/${repo.owner}/${repo.name}`;
  let latest: Repo['release'] = null;
  if (release?.status === 200) {
    const x = json(release);
    latest = {
      tag: str(x.tag_name, 60),
      date: str(x.published_at, 10),
      assets: (Array.isArray(x.assets) ? x.assets : [])
        .map(
          (a: {
            name?: unknown;
            size?: unknown;
            browser_download_url?: unknown;
            digest?: unknown;
          }) => ({
            name: str(a?.name, 120),
            bytes: typeof a?.size === 'number' ? a.size : 0,
            url: str(a?.browser_download_url, 400),
            digest: str(a?.digest, 80) || null,
          }),
        )
        // Only files of this repository's own releases, served by GitHub.
        .filter(
          (a) =>
            a.name && a.url.toLowerCase().startsWith(`${github}/releases/download/`.toLowerCase()),
        )
        .slice(0, 40),
    };
  }
  let text = '';
  if (readme?.status === 200) {
    const x = json(readme);
    if (x.encoding === 'base64' && typeof x.content === 'string')
      text = Buffer.from(x.content, 'base64').toString('utf8').slice(0, README_CHARS);
  }
  const fullName = str(r.full_name, 140).split('/');
  return {
    owner: fullName[0] || repo.owner,
    name: fullName[1] || repo.name,
    url: str(r.html_url, 300) || `https://github.com/${repo.owner}/${repo.name}`,
    description: str(r.description, 400),
    language: str(r.language, 40) || null,
    license: typeof license === 'string' && license !== 'NOASSERTION' ? license : null,
    stars: typeof r.stargazers_count === 'number' ? r.stargazers_count : 0,
    archived: r.archived === true,
    topics: (Array.isArray(r.topics) ? r.topics : [])
      .map((t) => str(t, 40))
      .filter(Boolean)
      .slice(0, 12),
    release: latest?.tag ? latest : null,
    readme: text,
  };
}

/** Free to use as the libraries are: a permissive license GitHub recognized. */
export const freeLicense = (repo: Pick<Repo, 'license'>) =>
  !!repo.license && permissive(repo.license);
