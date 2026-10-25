import { describe, expect, it } from 'vitest';

import { dataDir } from '../src/data-dir.ts';

const win = String.raw;

describe('dataDir', () => {
  it('uses the system data folder of each platform', () => {
    expect(
      dataDir('win32', { APPDATA: win`C:\Users\ana\AppData\Roaming` }, win`C:\Users\ana`),
    ).toBe(win`C:\Users\ana\AppData\Roaming\Cerebro`);
    expect(dataDir('darwin', {}, '/Users/ana')).toBe(
      '/Users/ana/Library/Application Support/Cerebro',
    );
    expect(dataDir('linux', {}, '/home/ana')).toBe('/home/ana/.local/share/cerebro');
    expect(dataDir('linux', { XDG_DATA_HOME: '/data' }, '/home/ana')).toBe('/data/cerebro');
  });

  it('falls back to the home folder on Windows without APPDATA', () => {
    expect(dataDir('win32', {}, win`C:\Users\ana`)).toBe(win`C:\Users\ana\AppData\Roaming\Cerebro`);
  });

  it('can be overridden', () => {
    expect(dataDir('linux', { CEREBRO_DATA_DIR: '/tmp/x' }, '/home/ana')).toBe('/tmp/x');
  });
});
