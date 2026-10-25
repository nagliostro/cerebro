// Copies the libraries the neurons' applications may use into public/neuron-kit/lib/, with their
// licenses. An application runs with no network, so what it needs beyond plain code comes from
// the kit, served by the Cerebro itself. Run after changing a version: node scripts/kit-libs.mjs
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const out = new URL('../public/neuron-kit/lib/', import.meta.url);
mkdirSync(out, { recursive: true });

const LIBS = [
  // Read, split, merge and write PDFs (MIT).
  { pkg: 'pdf-lib', file: 'dist/pdf-lib.min.js', license: 'LICENSE.md', as: 'pdf-lib' },
  // Make and read ZIP files (MIT, at our choice of its MIT or GPLv3).
  { pkg: 'jszip', file: 'dist/jszip.min.js', license: 'LICENSE.markdown', as: 'jszip' },
];

for (const lib of LIBS) {
  const root = path.dirname(require.resolve(`${lib.pkg}/package.json`));
  copyFileSync(path.join(root, lib.file), new URL(`${lib.as}.min.js`, out));
  copyFileSync(path.join(root, lib.license), new URL(`${lib.as.toUpperCase()}-LICENSE.txt`, out));
  console.log(`${lib.pkg} → neuron-kit/lib/${lib.as}.min.js`);
}
