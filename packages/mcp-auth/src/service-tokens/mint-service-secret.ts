import { randomBytes } from 'node:crypto';
import { deriveSecretDigest } from './derive-secret-digest.ts';

// The secret is shown once; the service-token file holds only its digest.
export function mintServiceSecret(): { readonly secret: string; readonly digest: string } {
  const secret = `svcs_${randomBytes(32).toString('base64url')}`;

  return { secret, digest: deriveSecretDigest(secret) };
}
