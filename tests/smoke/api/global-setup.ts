import { ensureServersRunning } from './setup.js';

/**
 * Vitest global setup — runs once before all smoke tests.
 * Ensures that both the API and web servers are reachable.
 */
export async function setup(): Promise<void> {
  await ensureServersRunning();
}
