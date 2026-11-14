import { randomBytes } from 'node:crypto';
import type { Clock } from '../types.ts';
import { deriveSecretDigest } from './derive-secret-digest.ts';

export const ISSUED_TOKEN_PREFIX = 'svca_';
export const ISSUED_TOKEN_SECONDS = 600;
export const ISSUED_TOKEN_CAP = 1000;

export interface IssuedToken {
  readonly clientName: string;
  readonly scopes: readonly string[];
  readonly expiresAtMs: number;
}

export interface IssuedTokens {
  // The new token, or null at the cap once the expired tokens are gone.
  readonly writeToken: (clientName: string, scopes: readonly string[]) => string | null;

  // Null for an unknown or expired token.
  readonly findToken: (token: string) => IssuedToken | null;
  readonly removeToken: (token: string) => void;
}

// Only the digest of each token stays in memory, and a restart empties the map.
export function createIssuedTokens(clock: Clock): IssuedTokens {
  const issued = new Map<string, IssuedToken>();

  const removeExpired = (): void => {
    const now = clock.now();

    for (const [key, entry] of issued) {
      if (entry.expiresAtMs <= now) {
        issued.delete(key);
      }
    }
  };

  return {
    writeToken: (clientName, scopes) => {
      if (issued.size >= ISSUED_TOKEN_CAP) {
        removeExpired();
      }

      if (issued.size >= ISSUED_TOKEN_CAP) {
        return null;
      }

      const token = `${ISSUED_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;

      issued.set(deriveSecretDigest(token), {
        clientName,
        scopes,
        expiresAtMs: clock.now() + ISSUED_TOKEN_SECONDS * 1000,
      });

      return token;
    },
    findToken: (token) => {
      const key = deriveSecretDigest(token);
      const entry = issued.get(key);

      if (entry === undefined) {
        return null;
      }

      if (entry.expiresAtMs <= clock.now()) {
        issued.delete(key);

        return null;
      }

      return entry;
    },
    removeToken: (token) => {
      issued.delete(deriveSecretDigest(token));
    },
  };
}
