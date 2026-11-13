import type { Requester } from '../types.ts';

export function buildTestRequester(overrides: Partial<Requester> = {}): Requester {
  return { socketAddress: '127.0.0.1', connectingIP: null, userAgent: 'test-client', ...overrides };
}
