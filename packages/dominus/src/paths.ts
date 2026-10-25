import { createHash } from 'node:crypto';
import path from 'node:path';

import { dataDir } from './data-dir.ts';

// Where the core keeps its things, all inside the owner's data folder. The core listens on a
// named pipe (Windows) or a Unix socket, never on a TCP port: no web page can reach either, and
// a second core fails to open the same one, which makes it the single-instance lock too.

export function corePaths(dir = dataDir()) {
  // Pipe names are global on Windows: one per data folder, so tests never meet the owner's core.
  const id = createHash('sha256').update(dir).digest('hex').slice(0, 12);
  return {
    dir,
    socket:
      process.platform === 'win32'
        ? `\\\\.\\pipe\\cerebro-core-${id}`
        : path.join(dir, 'core.sock'),
    token: path.join(dir, 'core-token'),
    db: path.join(dir, 'dominus.db'),
    connections: path.join(dir, 'connections.json'),
  };
}

export type CorePaths = ReturnType<typeof corePaths>;
