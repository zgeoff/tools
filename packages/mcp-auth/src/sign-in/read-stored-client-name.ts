import type { Store } from '../store/open-store.ts';
import type { OAuthClientID } from '../types.ts';
import { normalizeClientName } from '../utils/normalize-client-name.ts';

// The name the owner gave the client, cleaned for a page or an event, or the
// client's ID when the core holds no such client.
export async function readStoredClientName(store: Store, clientID: OAuthClientID): Promise<string> {
  const row = await store.db
    .selectFrom('oauthClient')
    .select('name')
    .where('clientId', '=', clientID)
    .executeTakeFirst();

  return normalizeClientName(row?.name, clientID);
}
