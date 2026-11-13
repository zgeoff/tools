import { expect, test } from 'bun:test';
import { deriveTokenHash } from './derive-token-hash.ts';

test('it hashes a token to its base64url SHA-256', () => {
  expect(deriveTokenHash('mcp_at_example')).toBe('Uw2pidNTuYDi2Txh8joX3LfYt-b_FwDZSCGVtJkiYkY');
});
