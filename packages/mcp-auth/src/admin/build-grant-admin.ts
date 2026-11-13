import type { Store } from '../store/open-store.ts';
import { removeGrantRows } from '../store/remove-grant-rows.ts';
import type { MCPAuthAdmin } from '../types.ts';
import { parseApprovedBy } from '../utils/parse-approved-by.ts';
import { parseJSONStrings } from '../utils/parse-json-strings.ts';

export function buildGrantAdmin(store: Store): MCPAuthAdmin['grants'] {
  return {
    list: async () => {
      const at = new Date(store.options.clock.now()).toISOString();

      const rows = await store.db
        .selectFrom('user')
        .leftJoin('oauthClient', 'oauthClient.clientId', 'user.clientId')
        .select([
          'user.id',
          'user.clientId',
          'user.scopes',
          'user.approvedBy',
          'user.createdAt',
          'user.lastUsedAt',
          'oauthClient.name as clientName',
        ])
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
        .orderBy('user.createdAt')
        .execute();

      return rows.flatMap((row) => {
        const approvedBy = parseApprovedBy(row.approvedBy);

        if (approvedBy === null) {
          return [];
        }

        return {
          grantID: row.id,
          clientID: row.clientId,
          clientName: row.clientName ?? row.clientId,
          scopes: parseJSONStrings(row.scopes ?? '[]') ?? [],
          approvedBy,
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt,
        };
      });
    },

    revoke: async (grantID) => {
      const removed = await removeGrantRows(store, [grantID]);

      return removed.length > 0;
    },
  };
}
