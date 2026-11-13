import { toTagged } from '@zgeoff/std';
import type { Store } from '../store/open-store.ts';
import type { OAuthClientID } from '../types.ts';
import { parseJSONStrings } from '../utils/parse-json-strings.ts';

// The scopes of the server that any live grant of the client holds, or null
// when the client holds none.
export async function readClientScopes<Scope extends string>(
  store: Store,
  known: readonly Scope[],
  clientID: string,
): Promise<readonly Scope[] | null> {
  const at = new Date(store.options.clock.now()).toISOString();

  const rows = await store.db
    .selectFrom('user')
    .select('user.scopes')
    .where('user.clientId', '=', toTagged<OAuthClientID>(clientID))
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom('oauthRefreshToken')
          .select('oauthRefreshToken.id')
          .whereRef('oauthRefreshToken.userId', '=', 'user.id')
          .where('oauthRefreshToken.revoked', 'is', null)
          .where('oauthRefreshToken.expiresAt', '>', at),
      ),
    )
    .execute();

  const held = new Set(rows.flatMap((row) => parseJSONStrings(row.scopes ?? '[]') ?? []));

  const scopes = known.filter((scope) => held.has(scope));

  return scopes.length === 0 ? null : scopes;
}
