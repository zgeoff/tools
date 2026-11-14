import type { Clock, ServiceTokenFile } from '../types.ts';
import { buildServiceSnapshot } from './build-service-snapshot.ts';
import type { ServiceSnapshot } from './build-service-snapshot.ts';
import { createIssuedTokens } from './create-issued-tokens.ts';
import type { IssuedTokens } from './create-issued-tokens.ts';

// What the token route and `verify` read on each call.
export interface ServiceState<Scope extends string> {
  // Null when the app passed no service tokens.
  readonly findSnapshot: () => ServiceSnapshot<Scope> | null;
  readonly issued: IssuedTokens;
}

export function createServiceState<Scope extends string>(
  file: ServiceTokenFile<Scope> | null,
  clock: Clock,
): {
  readonly state: ServiceState<Scope>;
  readonly replace: (file: ServiceTokenFile<Scope>) => void;
} {
  let snapshot = file === null ? null : buildServiceSnapshot(file);

  return {
    state: { findSnapshot: () => snapshot, issued: createIssuedTokens(clock) },
    replace: (next) => {
      snapshot = buildServiceSnapshot(next);
    },
  };
}
