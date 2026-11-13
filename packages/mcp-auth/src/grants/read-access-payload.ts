import { isRecord, toTagged } from '@zgeoff/std';
import type { GrantID, OAuthClientID } from '../types.ts';

interface AccessPayload {
  readonly grantID: GrantID;
  readonly clientID: OAuthClientID;
  readonly audiences: readonly string[];
  readonly scopes: readonly string[];
}

// A payload bound to a key (`cnf`) gives null: no route checks a proof of the
// key, and a stolen bound token must not pass.
export function readAccessPayload(payload: unknown): AccessPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (payload['cnf'] !== undefined && payload['cnf'] !== null) {
    return null;
  }

  const grantID = payload['sub'];
  const clientID = payload['client_id'];
  const scope = payload['scope'];
  const audience: unknown = payload['aud'];

  if (typeof grantID !== 'string' || typeof clientID !== 'string' || clientID === '') {
    return null;
  }

  return {
    grantID: toTagged<GrantID>(grantID),
    clientID: toTagged<OAuthClientID>(clientID),
    audiences: [audience].flat().filter((item): item is string => typeof item === 'string'),
    scopes: typeof scope === 'string' ? scope.split(' ') : [],
  };
}
