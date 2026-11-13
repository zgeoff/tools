import { toTagged } from '@zgeoff/std';
import { generateRandomString } from 'better-auth/crypto';
import { MCPAuthError } from '../mcp-auth-error.ts';
import type { SignInState } from '../sign-in/create-sign-in-state.ts';
import type { Store } from '../store/open-store.ts';
import { removeGrantRows } from '../store/remove-grant-rows.ts';
import type { GrantID, MCPAuthAdmin, OAuthClientID } from '../types.ts';
import { normalizeClientName } from '../utils/normalize-client-name.ts';
import { checkRedirectURIs } from './check-redirect-uris.ts';
import { readClientName } from './read-client-name.ts';
import { toClientView } from './to-client-view.ts';

export function buildClientAdmin(
  store: Store,
  signIns: Pick<SignInState, 'removeClient'> | null,
): MCPAuthAdmin['clients'] {
  const readClient = (name: string) =>
    store.db.selectFrom('oauthClient').selectAll().where('name', '=', name).executeTakeFirst();

  const requireClient = async (clientID: OAuthClientID) => {
    const client = await store.db
      .selectFrom('oauthClient')
      .selectAll()
      .where('clientId', '=', clientID)
      .executeTakeFirst();

    if (client === undefined) {
      throw new MCPAuthError('not-found', 'no client has that ID');
    }

    return client;
  };

  return {
    list: async () => {
      const rows = await store.db.selectFrom('oauthClient').selectAll().orderBy('name').execute();

      return rows.map((row) => toClientView(row));
    },

    // A database from the old apps can hold names that clean alike, so the
    // match is on the cleaned stored name.
    readByName: async (name) => {
      const cleaned = readClientName(name);

      const rows = await store.db.selectFrom('oauthClient').selectAll().orderBy('name').execute();

      return rows
        .filter((row) => normalizeClientName(row.name, '') === cleaned)
        .map((row) => toClientView(row));
    },

    add: async (name, redirectURIs) => {
      const cleaned = readClientName(name);

      checkRedirectURIs(redirectURIs);

      if ((await readClient(cleaned)) !== undefined) {
        throw new MCPAuthError('conflict', 'a client already has that name');
      }

      const now = new Date(store.options.clock.now()).toISOString();

      const clientID = toTagged<OAuthClientID>(generateRandomString(32, 'a-z', 'A-Z', '0-9'));

      const row = await store.db
        .insertInto('oauthClient')
        .values({
          id: crypto.randomUUID(),
          clientId: clientID,
          name: cleaned,
          redirectUris: JSON.stringify(redirectURIs),
          scopes: JSON.stringify([...store.options.scopes, 'offline_access']),
          clientCredentialsScopes: '[]',
          tokenEndpointAuthMethod: 'none',
          grantTypes: JSON.stringify(['authorization_code', 'refresh_token']),
          responseTypes: JSON.stringify(['code']),
          applicationType: redirectURIs.every((uri) => uri.startsWith('https:')) ? 'web' : 'native',
          requirePKCE: 1,
          disabled: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return toClientView(row);
    },

    update: async (clientID, redirectURIs) => {
      const client = await requireClient(clientID);

      checkRedirectURIs(redirectURIs);

      const row = await store.db
        .updateTable('oauthClient')
        .set({
          redirectUris: JSON.stringify(redirectURIs),
          updatedAt: new Date(store.options.clock.now()).toISOString(),
        })
        .where('clientId', '=', client.clientId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return toClientView(row);
    },

    remove: async (clientID) => {
      const client = await requireClient(clientID);

      const grants = await store.db
        .selectFrom('user')
        .select('id')
        .where('clientId', '=', client.clientId)
        .execute();

      const revoked = await removeGrantRows(
        store,
        grants.map((grant): GrantID => grant.id),
      );

      await store.db.deleteFrom('oauthClient').where('clientId', '=', client.clientId).execute();

      signIns?.removeClient(client.clientId);

      return revoked.length;
    },
  };
}
