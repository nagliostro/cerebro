import { AsyncEntry } from '@napi-rs/keyring';

// The vault: API keys go to the system's credential store (Windows Credential Manager, macOS
// Keychain, Secret Service on Linux), never to the browser, the database or a plain file. When
// the system has no store (a Linux without a keyring), the vault says so and stores nothing:
// the screen then explains what to install instead of falling back to a file.

export interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<boolean>;
}

/** The system's credential store, with every entry under one service name. */
export function systemStore(service = 'Cerebro'): SecretStore {
  const entry = (name: string) => new AsyncEntry(service, name);
  return {
    get: (name) => entry(name).getPassword(),
    set: (name, value) => entry(name).setPassword(value),
    delete: (name) => entry(name).deleteCredential(),
  };
}

// Names are ours (e.g. "connection:my-api"), never typed by a person or a neuron.
const NAME = /^[a-z0-9][a-z0-9:._-]{0,63}$/;

function checkName(name: string) {
  if (!NAME.test(name)) throw new Error(`Invalid vault name: ${name}`);
}

export function createVault(store: SecretStore = systemStore()) {
  return {
    /** Whether the system has a store the vault can use. */
    async available(): Promise<boolean> {
      try {
        await store.get('probe');
        return true;
      } catch {
        return false;
      }
    },
    async get(name: string) {
      checkName(name);
      return store.get(name);
    },
    async set(name: string, value: string) {
      checkName(name);
      if (!value) throw new Error('Empty secret');
      await store.set(name, value);
    },
    async delete(name: string) {
      checkName(name);
      return store.delete(name);
    },
  };
}

export type Vault = ReturnType<typeof createVault>;
