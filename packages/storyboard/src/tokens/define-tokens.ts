import type { BaseTokenName, TokenValue, Tokens } from '../types.ts';
import { BASE_TOKENS } from './base-tokens.ts';

// The scene's tokens add to the base tokens or replace them.
export function defineTokens<const T extends Readonly<Record<string, TokenValue>>>(
  values: T,
): Tokens<Extract<keyof T, string>> {
  return { values: { ...BASE_TOKENS, ...values } satisfies Record<BaseTokenName, TokenValue> };
}
