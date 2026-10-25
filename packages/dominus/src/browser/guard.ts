import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// Where the Navegador may go: only the public internet. A page the AI reads can try to lead it to
// this computer, the home network or the owner's tailnet (SSRF); every connection the browser
// makes goes through the proxy below, which resolves the name itself and refuses any address that
// is not public. The browser never resolves names on its own, so DNS rebinding has nothing to
// race against.

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT, and Tailscale's addresses
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata lives here)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and broadcast
] as const)
  blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local (Tailscale's IPv6 too)
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const)
  blocked.addSubnet(net, prefix, 'ipv6');

/** An IPv4 address carried inside an IPv6 one (mapped, NAT64, 6to4), which must be checked too. */
function embeddedV4(address: string): string | null {
  const a = address.toLowerCase();
  const dotted = a.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1]!;
  const hex = a.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const n = (parseInt(hex[1]!, 16) << 16) | parseInt(hex[2]!, 16);
    return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
  }
  return null;
}

export function isPublicAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return !blocked.check(address, 'ipv4');
  if (kind === 6) {
    const v4 = embeddedV4(address);
    if (v4) return !blocked.check(v4, 'ipv4');
    // 6to4 (2002::/16) carries an IPv4 address in its next 32 bits.
    const sixToFour = address.toLowerCase().match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4}):/);
    if (sixToFour) {
      const n = (parseInt(sixToFour[1]!, 16) << 16) | parseInt(sixToFour[2]!, 16);
      if (blocked.check([24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.'), 'ipv4')) return false;
    }
    return !blocked.check(address, 'ipv6');
  }
  return false;
}

/** Names that are never the public internet, whatever they resolve to. */
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.ts.net'];
const PORTS = new Set([80, 443]);

export class BlockedError extends Error {}

/**
 * Host and port the tests serve their own pages on ("127.0.0.1:4567,..."). Only the tests set it;
 * the owner's Cerebro never does.
 */
const testAllowed = () =>
  new Set(
    (process.env.CEREBRO_BROWSER_ALLOW ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

/**
 * Where to really connect for host:port, or BlockedError. Every address the name resolves to must
 * be public: one private answer among public ones is refused too.
 */
export async function resolvePublic(host: string, port: number): Promise<string> {
  const name = host
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (testAllowed().has(`${name}:${port}`)) return name;
  if (!PORTS.has(port)) throw new BlockedError(`port ${port}`);
  if (!name || name === 'localhost' || PRIVATE_SUFFIXES.some((s) => name.endsWith(s)))
    throw new BlockedError(`private name ${name}`);
  if (isIP(name)) {
    if (!isPublicAddress(name)) throw new BlockedError(`private address ${name}`);
    return name;
  }
  // A single label ("intranet") is a name of the local network.
  if (!name.includes('.')) throw new BlockedError(`local name ${name}`);
  const answers = await lookup(name, { all: true, verbatim: true }).catch(() => {
    throw new BlockedError(`unknown name ${name}`);
  });
  if (!answers.length) throw new BlockedError(`unknown name ${name}`);
  const bad = answers.find((a) => !isPublicAddress(a.address));
  if (bad) throw new BlockedError(`${name} points to ${bad.address}`);
  return answers[0]!.address;
}

/** A URL the Navegador may open: http or https, to a public host. */
export async function checkUrl(url: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new BlockedError('not a URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BlockedError(u.protocol);
  if (u.username || u.password) throw new BlockedError('credentials in the URL');
  await resolvePublic(u.hostname, Number(u.port) || (u.protocol === 'https:' ? 443 : 80));
  return u;
}
