import path from 'node:path';

// Where the owner's data lives: the system's data folder, outside the program folder, so
// updating or reinstalling never deletes anything. CEREBRO_DATA_DIR overrides it (tests).

export function dataDir(
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
  home: string = env.HOME ?? env.USERPROFILE ?? '',
): string {
  if (env.CEREBRO_DATA_DIR) return env.CEREBRO_DATA_DIR;
  if (platform === 'win32') {
    const appData = env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming');
    return path.win32.join(appData, 'Cerebro');
  }
  if (platform === 'darwin')
    return path.posix.join(home, 'Library', 'Application Support', 'Cerebro');
  return path.posix.join(env.XDG_DATA_HOME || path.posix.join(home, '.local', 'share'), 'cerebro');
}
