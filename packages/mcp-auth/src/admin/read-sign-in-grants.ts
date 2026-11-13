import type { Store } from '../store/open-store.ts';
import type { GrantID } from '../types.ts';

// A grant row with no refresh token is a sign-in that has not finished.
export async function readSignInGrants(store: Store): Promise<GrantID[]> {
  const rows = await store.db
    .selectFrom('user')
    .select('user.id')
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('oauthRefreshToken')
            .select('oauthRefreshToken.id')
            .whereRef('oauthRefreshToken.userId', '=', 'user.id'),
        ),
      ),
    )
    .execute();

  return rows.map((row) => row.id);
}
