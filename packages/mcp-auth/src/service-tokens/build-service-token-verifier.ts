import { createHash, timingSafeEqual } from 'node:crypto';
import type { Access, ServiceTokenFile } from '../types.ts';

interface StoredToken<Scope extends string> {
  readonly digest: Buffer;
  readonly access: Extract<Access<Scope, never>, { kind: 'service' }>;
}

export interface ServiceTokenVerifier<Scope extends string> {
  // The access a service token grants, or null for any other value.
  readonly verify: (token: string) => StoredToken<Scope>['access'] | null;

  // The scopes of a service client, or null for an ID the file does not list.
  readonly findScopes: (clientID: string) => readonly Scope[] | null;
}

// Only the digests of the tokens stay in memory.
export function buildServiceTokenVerifier<Scope extends string>(
  file: ServiceTokenFile<Scope>,
): ServiceTokenVerifier<Scope> {
  const stored: StoredToken<Scope>[] = file.clients.flatMap((client) => {
    const clientID: `service:${string}` = `service:${client.name}`;

    const access: StoredToken<Scope>['access'] = {
      kind: 'service',
      clientID,
      clientName: clientID,
      scopes: client.scopes,
    };

    return client.tokens.map((token) => ({ digest: toDigest(token), access }));
  });

  return {
    verify: (token) => {
      const presented = toDigest(token);
      let match: StoredToken<Scope>['access'] | null = null;

      // Every stored token is compared, so the time taken does not say which
      // one matched.
      for (const entry of stored) {
        if (timingSafeEqual(presented, entry.digest)) {
          match = entry.access;
        }
      }

      return match;
    },
    findScopes: (clientID) =>
      stored.find((entry) => entry.access.clientID === clientID)?.access.scopes ?? null,
  };
}

function toDigest(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
