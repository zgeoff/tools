import { sql } from 'kysely';
import type { Store } from '../store/open-store.ts';
import { removeGrantRows } from '../store/remove-grant-rows.ts';

// A grant row with no live refresh token that is older than this is a sign-in
// that never finished, or a grant whose client stopped refreshing.
const UNUSED_GRANT_MS = 60 * 60_000;

export async function removeExpired(store: Store): Promise<void> {
  const now = store.options.clock.now();

  const at = new Date(now).toISOString();

  const stale = await store.db
    .selectFrom('user')
    .select('user.id')
    .where('user.createdAt', '<', new Date(now - UNUSED_GRANT_MS).toISOString())
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('oauthRefreshToken')
            .select('oauthRefreshToken.id')
            .whereRef('oauthRefreshToken.userId', '=', 'user.id')
            .where('oauthRefreshToken.revoked', 'is', null)
            .where('oauthRefreshToken.expiresAt', '>', at),
        ),
      ),
    )
    .execute();

  await removeGrantRows(
    store,
    stale.map((row) => row.id),
  );

  // A rotated refresh token that has not expired stays, so a replay of it
  // still ends its grant.
  await store.db.deleteFrom('oauthRefreshToken').where('expiresAt', '<', at).execute();
  await store.db.deleteFrom('oauthAccessToken').where('expiresAt', '<', at).execute();
  await store.db.deleteFrom('session').where('expiresAt', '<', at).execute();
  await store.db.deleteFrom('verification').where('expiresAt', '<', at).execute();

  await sql`delete from ${sql.table(store.options.tables.enrollmentToken)} where expires_at < ${at}`.execute(
    store.db,
  );
}
