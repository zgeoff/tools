import type { Ready } from './types.ts';

// The result of one readiness check: `line` is the stdout line that matched, or null for a check
// that matches no line.
export interface ReadyResult {
  readonly line: string | null;
}

// Runs one readiness check. Only a whole stdout line can match, so a test that parses the ready
// line never gets half of one.
export async function readReadyLine(
  ready: Ready,
  baseURL: string,
  findNextLine: (pattern: string | RegExp) => string | null,
): Promise<ReadyResult | null> {
  if ('stdout' in ready) {
    const line = findNextLine(ready.stdout);

    return line === null ? null : { line };
  }

  if ('check' in ready) {
    const isReady = await ready.check();

    return isReady ? { line: null } : null;
  }

  try {
    const response = await fetch(new URL(ready.url, baseURL), {
      signal: AbortSignal.timeout(1000),
    });

    return response.ok ? { line: null } : null;
  } catch {
    return null;
  }
}
