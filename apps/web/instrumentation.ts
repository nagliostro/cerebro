// Runs once when the server starts (Node only; the code lives in lib/server/start.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await (await import('@/lib/server/start')).start();
}
