import type { TokenReference, TokenValue } from '../types.ts';

export function buildTokenReference(
  values: Readonly<Record<string, TokenValue>>,
  name: string,
): TokenReference {
  return { node: 'token', name, values };
}
