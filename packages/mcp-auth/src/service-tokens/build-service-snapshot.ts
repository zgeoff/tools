import type { ServiceTokenFile } from '../types.ts';
import { buildServiceTokenVerifier } from './build-service-token-verifier.ts';
import type { ServiceTokenVerifier } from './build-service-token-verifier.ts';

export interface ServiceSnapshot<Scope extends string> {
  readonly file: ServiceTokenFile<Scope>;
  readonly verifier: ServiceTokenVerifier<Scope>;

  // Every secret digest of every client, as bytes.
  readonly secrets: readonly { readonly digest: Buffer; readonly clientID: string }[];
}

export function buildServiceSnapshot<Scope extends string>(
  file: ServiceTokenFile<Scope>,
): ServiceSnapshot<Scope> {
  return {
    file,
    verifier: buildServiceTokenVerifier(file),
    secrets: file.clients.flatMap((client) =>
      (client.secretDigests ?? []).map((digest) => ({
        digest: Buffer.from(digest, 'hex'),
        clientID: `service:${client.name}`,
      })),
    ),
  };
}
