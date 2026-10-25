import { describe, expect, it } from 'vitest';

import {
  checkRequest,
  isLoopbackHost,
  isSameOrigin,
  publicHost,
  publicOrigin,
} from './request-guard';

describe('request guard', () => {
  it('accepts only this computer as host, on any port', () => {
    for (const host of ['localhost:3000', '127.0.0.1:3100', '[::1]:3000', 'LOCALHOST', '127.0.0.1'])
      expect(isLoopbackHost(host)).toBe(true);
    for (const host of [
      null,
      '',
      'attacker.example',
      'localhost.attacker.example',
      '127.0.0.2:3000',
      '0.0.0.0:3000',
      '192.168.0.10:3000',
    ])
      expect(isLoopbackHost(host)).toBe(false);
  });

  it('compares origin and host, port included', () => {
    expect(isSameOrigin('http://localhost:3000', 'localhost:3000')).toBe(true);
    expect(isSameOrigin('http://localhost:3001', 'localhost:3000')).toBe(false);
    expect(isSameOrigin('http://127.0.0.1:3000', 'localhost:3000')).toBe(false);
    expect(isSameOrigin('null', 'localhost:3000')).toBe(false);
    expect(isSameOrigin(null, 'localhost:3000')).toBe(false);
  });

  it('refuses rebinding and cross-site changes, allows reads and own changes', () => {
    const local = 'localhost:3000';
    expect(checkRequest({ method: 'GET', host: 'evil.example', origin: null })).toBe('wrong-host');
    expect(checkRequest({ method: 'GET', host: local, origin: 'https://evil.example' })).toBe(
      'allow',
    );
    expect(checkRequest({ method: 'POST', host: local, origin: 'https://evil.example' })).toBe(
      'wrong-origin',
    );
    expect(checkRequest({ method: 'DELETE', host: local, origin: null })).toBe('wrong-origin');
    expect(checkRequest({ method: 'POST', host: local, origin: 'http://localhost:3000' })).toBe(
      'allow',
    );
  });

  it('lets in the remote address the owner turned on, and only that one', () => {
    const remote = 'pc.tail-example.ts.net';
    const post = (host: string, origin: string, forwardedHost?: string) =>
      checkRequest({ method: 'POST', host, origin, forwardedHost, remote });
    expect(post(remote, `https://${remote}`)).toBe('allow');
    expect(post('127.0.0.1:3000', `https://${remote}`, remote)).toBe('allow');
    expect(post(remote, 'https://evil.example')).toBe('wrong-origin');
    expect(post('other.tail-example.ts.net', 'https://other.tail-example.ts.net')).toBe(
      'wrong-host',
    );
    // A forwarded name that is not the owner's changes nothing.
    expect(publicHost('127.0.0.1:3000', 'evil.example', remote)).toBe('127.0.0.1:3000');
    expect(publicHost('evil.example', remote, remote)).toBe('evil.example');
    // Without a remote address turned on, the remote name is just another host.
    expect(checkRequest({ method: 'GET', host: remote, origin: null })).toBe('wrong-host');
    expect(publicOrigin(remote, remote)).toBe(`https://${remote}`);
    expect(publicOrigin('localhost:3000', remote)).toBe('http://localhost:3000');
  });
});
