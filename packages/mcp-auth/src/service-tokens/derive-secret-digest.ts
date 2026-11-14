import { createHash } from 'node:crypto';

// The sha256 of the whole secret, as lowercase hex.
export function deriveSecretDigest(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
