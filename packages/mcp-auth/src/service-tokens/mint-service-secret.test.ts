import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mintServiceSecret } from './mint-service-secret.ts';

test('#mintServiceSecret returns a prefixed secret and the sha256 hex of the whole secret', () => {
  const minted = mintServiceSecret();

  expect(minted.secret).toMatch(/^svcs_[A-Za-z0-9_-]{43}$/u);
  expect(minted.digest).toBe(createHash('sha256').update(minted.secret).digest('hex'));
});

test('#mintServiceSecret returns a new secret each call', () => {
  expect(mintServiceSecret().secret).not.toBe(mintServiceSecret().secret);
});
