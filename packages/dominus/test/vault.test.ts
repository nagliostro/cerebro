import { describe, expect, it } from 'vitest';

import { createVault, systemStore, type SecretStore } from '../src/vault.ts';

function memoryStore(): SecretStore {
  const map = new Map<string, string>();
  return {
    get: async (name) => map.get(name) ?? null,
    set: async (name, value) => void map.set(name, value),
    delete: async (name) => map.delete(name),
  };
}

describe('vault', () => {
  it('stores, reads and deletes by name', async () => {
    const vault = createVault(memoryStore());
    expect(await vault.available()).toBe(true);
    await vault.set('connection:my-api', 'sk-test');
    expect(await vault.get('connection:my-api')).toBe('sk-test');
    expect(await vault.delete('connection:my-api')).toBe(true);
    expect(await vault.get('connection:my-api')).toBeNull();
  });

  it('refuses odd names and empty secrets', async () => {
    const vault = createVault(memoryStore());
    await expect(vault.set('../x', 'v')).rejects.toThrow();
    await expect(vault.set('Connection', 'v')).rejects.toThrow();
    await expect(vault.set('ok', '')).rejects.toThrow();
  });

  it('says when the system has no store, and never falls back', async () => {
    const broken: SecretStore = {
      get: () => Promise.reject(new Error('no keyring')),
      set: () => Promise.reject(new Error('no keyring')),
      delete: () => Promise.reject(new Error('no keyring')),
    };
    const vault = createVault(broken);
    expect(await vault.available()).toBe(false);
    await expect(vault.set('ok', 'v')).rejects.toThrow('no keyring');
  });
});

// The real credential store of this computer, when it has one (a Linux runner without a
// keyring skips it).
const real = createVault(systemStore('Cerebro (test)'));
describe.skipIf(!(await real.available()))('system credential store', () => {
  it('keeps a secret and forgets it', async () => {
    const name = `test-${process.pid}`;
    await real.set(name, 'secret-value');
    expect(await real.get(name)).toBe('secret-value');
    expect(await real.delete(name)).toBe(true);
    expect(await real.get(name)).toBeNull();
  });
});
