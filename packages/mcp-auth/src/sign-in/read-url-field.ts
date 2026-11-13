import { isRecord } from '@zgeoff/std';

// The URL better-auth tells the browser to go to next, or null.
export function readURLField(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const next = body['url'] ?? body['redirect_uri'];

  return typeof next === 'string' ? next : null;
}
